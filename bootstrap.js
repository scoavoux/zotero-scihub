/* global Zotero, Services */
var chromeHandle

function install() {}

async function startup({ id, version, rootURI }) {
  await Zotero.initializationPromise

  const aomStartup = Components.classes['@mozilla.org/addons/addon-manager-startup;1'].getService(Components.interfaces.amIAddonManagerStartup)
  const manifestURI = Services.io.newURI(`${rootURI}manifest.json`)
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ['content', 'zotero-scihub', `${rootURI}content/`],
    ['skin', 'zotero-scihub', 'default', `${rootURI}skin/default/`],
  ])

  Services.scriptloader.loadSubScript(`${rootURI}content/scihub.js`)
  Zotero.Scihub.init({ id, version, rootURI })
  await Zotero.Scihub.startup()
}

function onMainWindowLoad({ window }) {
  Zotero.Scihub?.addToWindow(window)
}

function onMainWindowUnload({ window }) {
  Zotero.Scihub?.removeFromWindow(window)
}

function shutdown() {
  if (Zotero.Scihub) {
    Zotero.Scihub.shutdown()
    delete Zotero.Scihub
  }
  if (chromeHandle) {
    chromeHandle.destruct()
    chromeHandle = null
  }
}

function uninstall() {}
