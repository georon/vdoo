# vdoo

A desktop editor for database schemas. Design tables and relationships, see them as a Mermaid ER diagram, and ask AI
(Claude, ChatGPT, or any OpenAI-compatible endpoint) to review or change the design.

- **Diagram:** the schema is drawn with Mermaid's `erDiagram`. Click a table to edit its columns, or click a
  relationship line or its label to edit the relationship. Ctrl+scroll or the zoom buttons zoom.
- **Table editor:** every column with its data type, primary key (PK), foreign key (FK, with the column it
  references), nullability, uniqueness and comment. Reorder, add or remove columns.
- **Relationship editor:** parent and child tables, cardinality on each side, identifying or not, label, and the
  foreign key column pairs. It can create the FK column for you.
- **Mermaid tab:** the schema as Mermaid text. Edit it or paste a diagram and choose Apply.
- **Ask AI:** the assistant sees the current schema. When it proposes changes, choose **Apply to diagram**; Ctrl+Z
  undoes it.
- **Files:** schemas are saved as `.vdoo` (JSON). Open `.mmd` Mermaid files too. Export Mermaid, SQL (`CREATE TABLE`
  with keys) or an SVG image.

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

## Tests

```
npm test            # model, Mermaid and SQL tests; Claude Code lookup tests
npm run build && npm run smoke              # drives the built app in a hidden window
VDOO_SMOKE_AI=1 npm run smoke               # also asks your AI provider to change the schema
```

On Windows, run the tests from a path with a capital drive letter (`C:\projects\vdoo`, as PowerShell and cmd do).
Vitest can't find its runner when the path starts with `c:` (lowercase), as it does in Git Bash.

## Credits

The desktop shell and the AI providers (`electron/ai.cjs`, `custom-endpoint.cjs`, `chat-completions.cjs`,
`claude-path.cjs`, `network.cjs`) and the custom endpoint settings come from
[Folio](https://github.com/Forward-Future/folio) (MIT).
