import type { ZoteroItem, IZotero, ZoteroObserver } from '../typings/zotero'
import { ItemPane } from './itemPane'
import { ToolsPane } from './toolsPane'
import { UrlUtil } from './urlUtil'
import { ZoteroUtil } from './zoteroUtil'

declare const Zotero: IZotero

enum HttpCodes {
  DONE = 200,
}

class PdfNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfNotFoundError'
    Object.setPrototypeOf(this, PdfNotFoundError.prototype)
  }
}

class ItemObserver implements ZoteroObserver {
  // Called when a new item is added to the library
  public async notify(event: string, _type: string, ids: [number], _extraData: Record<string, any>) {
    const automaticPdfDownload = Zotero.Scihub.isAutomaticPdfDownload()

    if (event === 'add' && automaticPdfDownload) {
      const items = await Zotero.Items.getAsync(ids)
      await Zotero.Scihub.updateItems(items)
    }
  }
}

class Scihub {
  // TOOD: only bulk-update items which are missing paper attachement
  private static readonly DEFAULT_SCIHUB_URL = 'https://sci-hub.ru/'
  private static readonly DEFAULT_AUTOMATIC_PDF_DOWNLOAD = true
  private static readonly MENU_ELEMENT_CLASS = 'zotero-scihub-menu'
  private observerId: string | null = null
  private prefPaneId: string | null = null
  private initialized = false
  private pluginId = ''
  private rootURI = ''
  public ItemPane: ItemPane
  public ToolsPane: ToolsPane

  constructor() {
    this.ItemPane = new ItemPane()
    this.ToolsPane = new ToolsPane()
  }

  public init({ id, rootURI }: { id: string, version: string, rootURI: string }): void {
    this.pluginId = id
    this.rootURI = rootURI
  }

  public getBaseScihubUrl(): string {
    if (Zotero.Prefs.get('zoteroscihub.scihub_url') === undefined) {
      Zotero.Prefs.set('zoteroscihub.scihub_url', Scihub.DEFAULT_SCIHUB_URL)
    }

    return Zotero.Prefs.get('zoteroscihub.scihub_url') as string
  }

  public isAutomaticPdfDownload(): boolean {
    if (Zotero.Prefs.get('zoteroscihub.automatic_pdf_download') === undefined) {
      Zotero.Prefs.set('zoteroscihub.automatic_pdf_download', Scihub.DEFAULT_AUTOMATIC_PDF_DOWNLOAD)
    }

    return Zotero.Prefs.get('zoteroscihub.automatic_pdf_download') as boolean
  }

  public async startup(): Promise<void> {
    if (this.initialized) return
    // Register the callback in Zotero as an item observer
    this.observerId = Zotero.Notifier.registerObserver(new ItemObserver(), ['item'], 'Scihub')
    this.prefPaneId = await Zotero.PreferencePanes.register({
      pluginID: this.pluginId,
      src: `${this.rootURI}content/preferences.xhtml`,
      label: 'Zotero Scihub',
      image: `${this.rootURI}skin/default/sci-hub-logo.svg`,
    })
    for (const win of Zotero.getMainWindows()) {
      if (win.ZoteroPane) this.addToWindow(win)
    }
    this.initialized = true
  }

  public shutdown(): void {
    if (this.observerId) {
      Zotero.Notifier.unregisterObserver(this.observerId)
      this.observerId = null
    }
    if (this.prefPaneId) {
      Zotero.PreferencePanes.unregister(this.prefPaneId)
      this.prefPaneId = null
    }
    for (const win of Zotero.getMainWindows()) {
      this.removeFromWindow(win)
    }
    this.initialized = false
  }

  public addToWindow(win: Window & Record<string, any>): void {
    const doc = win.document as Document & { createXULElement: (tagName: string) => HTMLElement }
    if (doc.querySelector(`.${Scihub.MENU_ELEMENT_CLASS}`)) return
    win.MozXULElement.insertFTLIfNeeded('zotero-scihub.ftl')

    const icon = 'chrome://zotero-scihub/skin/sci-hub-logo.svg'
    const addMenu = (popupId: string, menuId: string, l10nId: string, command: () => Promise<void>) => {
      const popup = doc.getElementById(popupId)
      if (!popup) return
      const separator = doc.createXULElement('menuseparator')
      separator.classList.add(Scihub.MENU_ELEMENT_CLASS)
      const menuitem = doc.createXULElement('menuitem')
      menuitem.id = menuId
      menuitem.classList.add('menuitem-iconic', Scihub.MENU_ELEMENT_CLASS)
      menuitem.setAttribute('data-l10n-id', l10nId)
      menuitem.setAttribute('image', icon)
      menuitem.addEventListener('command', () => { command().catch(err => Zotero.logError(err)) })
      popup.append(separator, menuitem)
    }

    addMenu('zotero-itemmenu', 'zotero-itemmenu-scihub', 'zotero-scihub-update-item', () => this.ItemPane.updateSelectedItems())
    addMenu('zotero-collectionmenu', 'zotero-collectionmenu-scihub', 'zotero-scihub-update-collection', () => this.ItemPane.updateSelectedEntity())
    addMenu('menu_ToolsPopup', 'zotero-scihub-tools-updateall', 'zotero-scihub-update-all', () => this.ToolsPane.updateAll())
  }

  public removeFromWindow(win: Window): void {
    for (const elem of Array.from(win.document.querySelectorAll(`.${Scihub.MENU_ELEMENT_CLASS}`))) {
      elem.remove()
    }
    win.document.querySelector('[href="zotero-scihub.ftl"]')?.remove()
  }

  public async updateItems(items: ZoteroItem[]): Promise<void> {
    // WARN: Sequentially go through items, parallel will fail due to rate-limiting
    // Cycle needs to be broken if scihub asks for Captcha,
    // then user have to be redirected to the page to fill it in
    for (const item of items) {
      // Skip items which are not processable
      if (!item.isRegularItem() || item.isCollection()) { continue }

      // Skip items without DOI or if URL generation had failed
      const scihubUrl = this.generateScihubItemUrl(item)
      if (!scihubUrl) {
        ZoteroUtil.showPopup('DOI is missing', item.getField('title'), true)
        Zotero.debug(`scihub: failed to generate URL for "${item.getField('title')}"`)
        continue
      }

      try {
        await this.updateItem(scihubUrl, item)
      } catch (error) {
        if (error instanceof PdfNotFoundError) {
          // Do not stop traversing items if PDF is missing for one of them
          ZoteroUtil.showPopup('PDF not available', `Try again later.\n"${item.getField('title')}"`, true)
          continue
        } else {
          // Break if Captcha is reached, alert user and redirect
          ZoteroUtil.alert(
            `Captcha is required or PDF is not ready yet for "${item.getField('title')}".\n\
            You will be redirected to the scihub page.\n\
            Restart fetching process manually.\n\
            Error message: ${error}`)
          Zotero.launchURL(scihubUrl.href)
          break
        }
      }
    }
  }

  private async updateItem(scihubUrl: URL, item: ZoteroItem) {
    ZoteroUtil.showPopup('Fetching PDF', item.getField('title'))

    const xhr = await Zotero.HTTP.request('GET', scihubUrl.href, { responseType: 'document', headers:{'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Version/10.0 Mobile/14E304 Safari/602.1'} })
    // older .tf domains have iframe element, newer .st domain have embed element
    const rawPdfUrl = xhr.responseXML?.querySelector('#pdf')?.getAttribute('src')
    let pdfUrl = rawPdfUrl
    if (rawPdfUrl !== undefined && (!rawPdfUrl?.startsWith('http') && !rawPdfUrl?.startsWith('//'))) {
      pdfUrl = `${this.getBaseScihubUrl()}${rawPdfUrl}`
    }
    const body = xhr.responseXML?.querySelector('body')

    if (xhr.status === HttpCodes.DONE && pdfUrl) {
      const httpsUrl = UrlUtil.urlToHttps(pdfUrl)
      await ZoteroUtil.attachRemotePDFToItem(httpsUrl, item)
    } else if (xhr.status === HttpCodes.DONE && this.isPdfNotAvailable(body)) {
      Zotero.debug(`scihub: PDF is not available at the moment "${scihubUrl}"`)
      throw new PdfNotFoundError(`Pdf is not available: ${scihubUrl}`)
    } else {
      Zotero.debug(`scihub: failed to fetch PDF from "${scihubUrl}"`)
      throw new Error(xhr.statusText)
    }
  }

  private isPdfNotAvailable(body: HTMLBodyElement | null | undefined): boolean {
    const innerHTML = body?.innerHTML
    // older .tf domain return rich error message
    // newer .st domains return empty page if pdf is not available
    if (!innerHTML || innerHTML?.trim() === '' ||
      innerHTML?.match(/Please try to search again using DOI/im) ||
      innerHTML?.match(/статья не найдена в базе/im)) {
      return true
    }
    return false
  }

  private getDoi(item: ZoteroItem): string | null {
    const doiField = item.getField('DOI')
    const doiFromExtra = this.getDoiFromExtra(item)
    const doiFromUrl = this.getDoiFromUrl(item)
    const doi = doiField ?? doiFromExtra ?? doiFromUrl

    if (doi && (typeof doi === 'string') && doi.length > 0) {
      return doi
    }
    return null
  }

  private getDoiFromExtra(item: ZoteroItem): string | null {
    // For books "extra" field might contain DOI instead
    // values in extra are <key>: <value> separated by newline
    const extra = item.getField('extra')
    const match = extra?.match(/^DOI: (.+)$/m)
    if (match) {
      return match[1] as string
    }
    return null
  }

  private getDoiFromUrl(item: ZoteroItem): string | null {
    // If item was added by the doi.org url it can be extracted from its pathname
    const url = item.getField('url')
    const isDoiOrg = url?.match(/\bdoi\.org\b/i)
    if (isDoiOrg) {
      const doiPath = new URL(url).pathname
      return decodeURIComponent(doiPath).replace(/^\//, '')
    }
    return null
  }

  private generateScihubItemUrl(item: ZoteroItem): URL | null {
    const doi = this.getDoi(item)
    if (doi) {
      const baseUrl = this.getBaseScihubUrl()
      return new URL(doi, baseUrl)
    }
    return null
  }
}

Zotero.Scihub = new Scihub()

export { Scihub }
