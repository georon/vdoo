# vdoo

A desktop editor for database schemas. Design tables and relationships, see them as a Mermaid ER diagram, and ask AI
(Claude, ChatGPT, or any OpenAI-compatible endpoint) to review or change the design. Around the schema it is also a
small tabbed editor for the text, Markdown and HTML files that sit next to it.

- **Diagram:** the schema is drawn with Mermaid's `erDiagram`. Click a table to edit its columns, or click a
  relationship line or its label to edit the relationship. Ctrl+scroll or the zoom buttons zoom; **Fit** shows the
  whole diagram, and an opened schema that is larger than the window starts fitted. View › Column comments in
  diagram hides the comments in the drawing (they stay in the schema), which makes big diagrams much narrower.
- **Table editor:** every column with its data type, primary key (PK), foreign key (FK, with the column it
  references), nullability, uniqueness and comment. Reorder, add or remove columns.
- **Relationship editor:** parent and child tables, cardinality on each side, identifying or not, label, and the
  foreign key column pairs. It can create the FK column for you.
- **Mermaid tab:** the schema as Mermaid text. Edit it or paste a diagram and choose Apply. Mermaid has no syntax for
  which column a foreign key uses, so vdoo keeps the keys a relationship already had, reads a label that names the
  FK column (`partner_invoice_id`), and otherwise matches names such as `customer_id`, or `order_id` for `sale_order`.
- **Ask AI:** the assistant sees the current schema. When it proposes changes, choose **Apply to diagram**; Ctrl+Z
  undoes it.
- **Files:** schemas are saved as `.vdoo` (JSON). Open `.mmd` Mermaid files too. Export Mermaid, SQL (`CREATE TABLE`
  with keys) or an SVG image. File › Export as PDF (Ctrl+P) saves the active file tab as a PDF: Markdown rendered,
  rich text formatted, plain text as is. Images from the web or from file paths are not included in the PDF.
- **Odoo diagrams:** [odoo_native_tables/](odoo_native_tables/README.md) has ER diagrams of the main Odoo 19 apps,
  generated from the Odoo source.

## Files, tabs and editor modes

- **Menu bar and toolbar:** File, Edit, Schema, Mode and View menus across the top, with a toolbar of the common
  commands below it. The toolbar follows the active tab: schema tools on the Schema tab, the mode switch on a file tab.
- **Files pane:** File › Open folder shows the folder as a tree in the left pane (the **Files** tab, next to Tables
  and Mermaid). Sub-folders load when opened. The folder is reopened the next time vdoo starts.
- **Tabs:** every file opens in its own tab; a • marks unsaved changes. The first tab is always the schema.
  `.vdoo`, `.mmd` and `.mermaid` files open there; everything else gets a file tab.
- **Three modes per file tab,** from the Mode menu or the toolbar:
  - **Text:** plain text.
  - **Rich text:** WYSIWYG with a formatting bar (bold, italic, underline, strikethrough, font size, lists,
    alignment, clear formatting). Saved as HTML.
  - **Markdown:** source on the left and a live preview on the right, with a bar that inserts Markdown (headings,
    lists, task lists, quote, link, image, code block, table, rule).
- **Mode follows the file:** `.md` and `.markdown` open as Markdown, `.html` and `.htm` as rich text, anything else
  as text. Switching mode never changes the content, only how it is shown.

| Action | Shortcut |
|---|---|
| New file / New schema | Ctrl+N / Ctrl+Shift+N |
| Open file / Open folder | Ctrl+O / Ctrl+Shift+O |
| Save / Save as (the active tab) | Ctrl+S / Ctrl+Shift+S |
| Close tab | Ctrl+W |
| Text / Rich text / Markdown mode | Ctrl+Alt+T / Ctrl+Alt+R / Ctrl+Alt+M |
| Show or hide the sidebar | Ctrl+Shift+B |
| Find in the file (Enter: next match, Shift+Enter: previous) | Ctrl+F |
| Bold / Italic / Link (Markdown) | Ctrl+B / Ctrl+I / Ctrl+K |

Things to know: the page can only read and write inside the folder you opened and the files you picked in a dialog.
Files over 10 MB and binary files are not opened. HTML is sanitized before it is shown, and an HTML file edited as
rich text is saved as the edited body only (its `<head>`, scripts and styles are dropped). The Markdown preview does
not render raw HTML and does not load images from the network.

## Build and run

Needs Node.js 22 or later.

```
npm install --legacy-peer-deps
node node_modules/electron/install.js   # only if Electron's download was skipped
npm run app                             # build, then start the desktop app
```

`npm start` starts it again without rebuilding. `npm run dev` serves the editor in a browser (no AI there).
To build installers for this computer's platform: `npm run dist:win`, `npm run dist:mac` or `npm run dist:linux`.

## AI providers

Choose one under **Settings**. Claude is the default and uses your Claude subscription through Claude Code: either a
standalone Claude Code install or the copy inside Claude for Windows, signed in once. Credentials stay in Claude Code;
vdoo runs it with every tool disabled. ChatGPT uses "Sign in with ChatGPT"; a custom endpoint takes a base URL, an
optional key (stored with the OS credential store) and a model.

## Odoo connection

**Settings › Odoo** holds the Odoo URL, the admin user (`admin` unless you change it) and, optionally, the database
(left empty, vdoo uses the server's only database). **Test connection** asks for the password and signs in. The
password is never saved: vdoo asks for it each time it connects and uses it for that sign-in only. Addresses must use
https, except on this computer or your local network, where vdoo asks before the first connection.

## Tests

```
npm test            # model, Mermaid, SQL, text-editing and PDF tests, the Odoo diagrams; Claude Code lookup, file access and Odoo connection tests
npm run build && npm run smoke              # drives the built app in a hidden window
VDOO_SMOKE_AI=1 npm run smoke               # also asks your AI provider to change the schema
```

On Windows, run the tests from a path with a capital drive letter (`C:\projects\vdoo`, as PowerShell and cmd do).
Vitest can't find its runner when the path starts with `c:` (lowercase), as it does in Git Bash.

## Credits

The folder pane, file tabs and the text, rich text and Markdown editors come from Dexed.

The desktop shell and the AI providers (`electron/ai.cjs`, `custom-endpoint.cjs`, `chat-completions.cjs`,
`claude-path.cjs`, `network.cjs`) and the custom endpoint settings come from
[Folio](https://github.com/Forward-Future/folio) (MIT).
