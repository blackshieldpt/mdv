# Changelog

All notable changes to mdv are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-10-23

### Added

- Right-clicking selected text in the document opens a menu with Copy and Copy as Plain Text;
  the second copies the text without its formatting.

## [0.1.1] - 2026-10-15

### Changed

- The Edit menu shows only Copy, Select All and Find. Undo, redo, cut and paste are still
  available from the keyboard in the find bar.

## [0.1.0] - 2026-10-13

First version.

### Added

- Markdown viewer with GitHub-flavoured Markdown: tables, task lists, alerts, footnotes,
  definition lists, emoji and front matter.
- Syntax highlighting (Shiki), math (KaTeX) and diagrams (Mermaid).
- File tree of the Markdown files in a folder, kept up to date as files are added or removed.
  Opening a file on its own shows the folder it is in.
- Multiple documents in tabs; each tab remembers its scroll position.
- Automatic table of contents that follows the scroll position.
- File tree and table of contents panes that can be resized by dragging and collapsed.
- Links between documents, including links to a heading in another file.
- Back and forward through the documents shown.
- Find in the open document, with match count and next/previous.
- Single instance: opening a file while mdv is running adds a tab to its window.
- Live reload when an open document changes on disk.
- Light and dark themes, following the system or chosen in the View menu.
- Opening files and folders from the command line, the menus or by dropping them on the window.
- Print and PDF export, with options for a table of contents page with page numbers, page
  numbers in the footer and the file name in the header. PDFs carry a bookmark outline. Tables
  wider than the page are shrunk to fit it.
- About dialog with the application and runtime versions and the license of every bundled
  package.
- Application icon.
- Packaging for Linux (deb, snap), Windows (NSIS) and macOS (dmg), with a Makefile.
- Third-party license notices generated at build time and shipped with the packages.

### Security

- Documents are sanitized before display, and a content security policy blocks scripts and
  local file access from document content. Forms and `<style>` elements are removed, and a
  document's own positioned content cannot cover the application's panes.
- Local images are served only for open documents, only as image files, and only from the drive
  or network share the document is on. Links are followed only within that drive or share.
- The application's pages are served from an origin of their own, and the main process reads and
  watches only paths it handed to the window itself.
- A Mermaid diagram cannot add CSS to the application page, and KaTeX macros defined in one
  document do not carry over to the next.
- Folder watching does not follow symbolic links.
