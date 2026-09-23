# Note/News:
I've been away from any open source work for a while. I also have had issues with my Github account for a while. However!, I know a lot of people like this plugin and have posted a lot of ideas/errors in the issues. 

# Zotero Scihub

This is an add-on for [Zotero](https://www.zotero.org/) 7 to 10 that enables automatic download of PDFs for items with a DOI.

# Quick Start Guide

#### Install

- Download the latest release (.xpi file) from the [Releases Page](https://github.com/scoavoux/zotero-scihub/releases)
  _Note_ If you're using Firefox as your browser, right click the xpi and select "Save As.."
- In Zotero click "Tools" in the top menu bar and then click "Plugins"
- Click the gear icon in the top right and select "Install Plugin From File…"
- Browse to where you downloaded the .xpi file and select it. No restart is needed.

#### Usage

Once you have the plugin installed simply, right click any item in your collections.
There will now be a new context menu option titled "Update Scihub PDF." Once you
click this, a PDF of the file will be downloaded from Scihub and attached to your
item in Zotero.

For any new papers you add after this plugin is installed, the scihub pdf will be
automatically downloaded.

#### Configuration

Plugin is configured through the dedicated "Zotero Scihub" pane in Zotero's settings:

<img width="782" alt="Screenshot 2021-08-21 at 22 14 04" src="https://user-images.githubusercontent.com/387791/130333778-8bfb0878-2122-49a9-bc23-c528eb9b6cbf.png">

#### DNS-over-HTTPS

In case of malfunctioning or unsafe local DNS server, Zotero (as it's built on Firefox) might be configured with [Trusted Recursive Resolver](https://wiki.mozilla.org/Trusted_Recursive_Resolver) or DNS-over-HTTPS, where you could set your own DNS server just for Zotero without modifying network settings.

_Settings > Advanced > Config Editor_

1. set `network.trr.mode` to `2` or `3`, this enables DNS-over-HTTPS (2 enables it with fallback)
2. set `network.trr.uri` to `https://cloudflare-dns.com/dns-query`, this is the provider’s URL
3. set `network.trr.bootstrapAddress` to `1.1.1.1`, this is cloudflare’s normal DNS server (only) used to retrieve the IP of cloudfaire-dns.com
4. Restart zotero, wait for a DNS cache to clean up.

## Building

0. Pre-requisite is to have [node.js](nodejs.org) installed
1. Install dependencies `npm install`
2. Build `npm run build`, the plugin is written to `build/zotero-scihub-<version>.xpi`
3. To release, push a `v<version>` tag: CI attaches the `.xpi` and `update.json` (used by Zotero for automatic updates) to the GitHub release

## [Contributing](./CONTRIBUTING.md)

## Disclaimer

Use this code at your own peril. No warranties are provided. Keep the laws of your locality in mind!
