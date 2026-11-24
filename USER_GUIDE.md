# vdoo User Guide

vdoo is a desktop app with three tools in one window: a text editor, a database schema editor, and an Odoo app
designer. An AI assistant works alongside all three. This guide covers what each tool does and where to find its
controls: a menu item, a toolbar button, a tab, or a link.

In this guide, **Menu › Item** means "open the menu, then choose the item", and **bold** names the button or link to
click.

## Contents

1. [Text editor](#1-text-editor): plain text, rich text and Markdown files
2. [DB schema editor](#2-db-schema-editor): tables, relationships and the ER diagram
3. [Odoo app designer (Studio)](#3-odoo-app-designer-studio): models, fields, views (form, list, kanban, calendar, pivot, graph, search), menus, addon export
4. [Ask AI](#4-ask-ai): an assistant that reviews and designs schemas
5. [Files and folders](#5-files-and-folders): opening, saving, the Files pane and file types
6. [Settings](#6-settings): AI provider, default folder and Odoo connection
7. [Keyboard shortcuts](#7-keyboard-shortcuts)

### The window at a glance

| Area | Where | What it holds |
|---|---|---|
| Menu bar | Top | **File**, **Edit**, **Schema**, **Studio**, **Mode** and **View** menus |
| Toolbar | Under the menu bar | Common commands. It changes with the active tab. |
| Sidebar | Left | Three tabs: **Files** (folder tree), **Tables** (outline of the schema) and **Mermaid** (diagram source). **View › Sidebar** or **Ctrl+Shift+B** shows or hides it. |
| Tabs | Above the work area | The schema tab (◈), the app's **Studio:** (◧) and **Diagram:** tabs while an app is open, then one tab per text file. A **•** marks unsaved changes. |
| Ask AI panel | Right | The AI assistant. Show or hide it with the **Ask AI** toolbar button or **View › Ask AI**. |
| Status bar | Bottom | Table and relationship counts and any problems for the schema or app, or the editor mode and file path for a text file. |

---

## 1. Text editor

Every file that isn't a schema or an app (for example `.txt`, `.md` or `.html`) opens in its own tab in the text
editor. You can have as many open as you like.

### Creating, opening and closing files

| To… | Use |
|---|---|
| Create a new file | **File › New file**, the **New file** button, or **Ctrl+N** |
| Open files | **File › Open file…**, the **Open** button, or **Ctrl+O** (you can pick several) |
| Open a file from a folder | Click it in the sidebar's **Files** tab (see [Files and folders](#5-files-and-folders)) |
| Save / Save as | **File › Save** / **File › Save as…**, the **Save** button, or **Ctrl+S** / **Ctrl+Shift+S** |
| Close the tab | The **×** on the tab, a middle-click on the tab, **File › Close tab**, or **Ctrl+W**. vdoo asks first if there are unsaved changes. |

### The three modes

Each file tab shows its content in one of three modes. Switching modes changes only how the content is shown, never
the content itself. vdoo picks the mode from the file's extension: `.md` and `.markdown` open as Markdown, `.html`
and `.htm` as rich text, and anything else as text.

| Mode | What you get | How to switch |
|---|---|---|
| **Text** | Plain text | **Mode › Text**, the **Text** toolbar button, or **Ctrl+Alt+T** |
| **Rich text** | A formatted editor (what you see is what you get). Saved as HTML. | **Mode › Rich text**, the **Rich text** button, or **Ctrl+Alt+R** |
| **Markdown** | Markdown source on the left and a live preview on the right | **Mode › Markdown**, the **Markdown** button, or **Ctrl+Alt+M** |

### Formatting bars

**Rich text mode** has a formatting bar above the text:

- **B**, **I**, **U** and **S**: bold, italic, underline and strikethrough (Ctrl+B, Ctrl+I, Ctrl+U)
- **A+** and **A−**: bigger and smaller font
- **• List** and **1. List**: bullet and numbered lists
- **Left**, **Center** and **Right**: alignment
- **↶** and **↷**: undo and redo. **Clear** removes formatting.

**Markdown mode** has a bar that inserts Markdown at the cursor or around the selected text:

- **B**, **I**, **S** and **</>**: bold, italic, strikethrough and inline code
- **H1**, **H2** and **H3**: headings
- **• List**, **1. List**, **☑ Task** and **❝ Quote**: lists, task lists and quotes
- **Link** (Ctrl+K), **Image**, **{ }** (code block), **Table** and **―** (horizontal rule)
- **↶** and **↷**: undo and redo

### Find, zoom and PDF

| Feature | How to use it |
|---|---|
| **Find** | **Edit › Find…** or **Ctrl+F** opens a find box. **Enter** goes to the next match, **Shift+Enter** to the previous one, and **Esc** closes it. Find works in text, rich text and Markdown modes. |
| **Zoom the text** | The **−**, **100%** and **+** buttons in the toolbar. Click the percentage to reset it. The zoom applies to every file tab. |
| **Export as PDF** | **File › Export as PDF…**, the **Export PDF** toolbar button, or **Ctrl+P**. The PDF shows the file as it looks in its mode: Markdown rendered, rich text formatted, plain text as is. Images from the web or from file paths aren't included. |
| **Cut, copy, paste, select all** | The **Edit** menu, or the usual Ctrl+X, Ctrl+C, Ctrl+V and Ctrl+A |

> **Good to know:** HTML is cleaned before it's shown. When you save an HTML file edited as rich text, only the edited
> body is kept; its `<head>`, scripts and styles are dropped. The Markdown preview doesn't render raw HTML or load
> images from the web.

---

## 2. DB schema editor

The schema editor designs a database: tables, columns, keys and relationships, drawn as an ER (entity-relationship)
diagram. It always occupies the **first tab** (◈). Schemas are saved as **`.vdoo`** files.

### Starting a schema

| To… | Use |
|---|---|
| Start a new, empty schema | **File › New schema** or **Ctrl+Shift+N** |
| Open a schema | **File › Open file…** and pick a `.vdoo`, `.mmd` or `.mermaid` file, or click one in the **Files** tab |
| Try an example | The **Open an example** link in the sidebar's **Tables** tab (shown while the schema is empty) |
| Have AI design one | Ask in the **Ask AI** panel, for example "Design a schema for a library", then click **Apply to diagram** |
| Close the schema | The **×** on the schema tab. This leaves an empty schema, because the first tab is always the schema. |

### Tables

| To… | Use |
|---|---|
| Add a table | The **+ Table** toolbar button or **Schema › Add table** |
| Edit a table | Click the table in the diagram, or click it in the sidebar's **Tables** tab |

The **table editor** opens as a dialog with:

- **Name**, **Description** (what one row represents) and a **Highlight** colour for the table in the diagram.
- A row for each column, with these settings:
  - **PK** (primary key)
  - **Column** name
  - **Data type**
  - **Null** (whether the column allows NULL)
  - **Unique**
  - **Foreign key** (the column it references)
  - **Comment**
- **↑** and **↓** to reorder columns, **×** to remove one, and **+ Add column** to add one.
- **Referenced by**: the relationships that point at this table. Click one to edit it.
- **Save** (or **Ctrl+Enter**), **Cancel**, and **Delete table**, which asks you to confirm and also removes the table's relationships.

### Relationships

| To… | Use |
|---|---|
| Add a relationship | The **+ Relationship** toolbar button or **Schema › Add relationship** |
| Edit a relationship | Click its line or its label in the diagram, or click it in the sidebar's **Tables** tab |

The **relationship editor** has these settings:

- **Referenced table (parent)** and **Referencing table (child)**, each with a cardinality: one, zero or one, zero or more, or one or more.
- A **Label**, such as "places" or "owns".
- **Identifying**: the child's primary key includes the parent's. It is drawn as a solid line.
- **Foreign key columns**: pairs of a child column and the parent column it references. **+ Add column pair** adds a pair. Choosing **+ New column** in the child list creates the foreign key column for you.
- **Save**, **Cancel** and **Delete relationship**.

### The diagram

- **Zoom** with the **−**, **+** and percentage buttons in the bottom-right corner of the diagram, or with Ctrl+scroll.
  **Fit** shows the whole diagram. A schema that's larger than the window opens already fitted.
- **View › Column comments in diagram** shows or hides column comments in the drawing. They stay in the schema, and
  hiding them makes big diagrams much narrower.

### The sidebar: Tables and Mermaid

- **Tables** tab: an outline of every table (🔑 marks a primary key, ↗ a foreign key) and every relationship. Click
  any item to edit it.
- **Mermaid** tab: the schema as Mermaid `erDiagram` text. Edit it or paste a diagram in, then click **Apply**
  (or press **Ctrl+Enter**). **Revert** throws your edits away, and **Copy** copies the text. Applying replaces the
  diagram, and **Ctrl+Z** undoes it.

### Undo, export and saving

| To… | Use |
|---|---|
| Undo / Redo | **Edit › Undo** / **Edit › Redo**, the **Undo** / **Redo** buttons, or **Ctrl+Z** / **Ctrl+Y** (Ctrl+Shift+Z also redoes) |
| Save as `.vdoo` | **File › Save** / **Save as…** or **Ctrl+S** / **Ctrl+Shift+S** while the schema tab is active |
| Export Mermaid (`.mmd`) | **File › Export schema as Mermaid…** or the toolbar's **Export…** list › **Mermaid (.mmd)** |
| Export SQL (`.sql`) | **File › Export schema as SQL…** or **Export…** › **SQL (.sql)**. This writes `CREATE TABLE` statements with their keys. |
| Export an image (`.svg`) | **File › Export schema as image (SVG)…** or **Export…** › **Image (.svg)** |
| Turn the schema into an Odoo app | **Studio › Make an Odoo app from the schema diagram…** (see the next section). The schema itself stays as it is. |

> **Ready-made Odoo diagrams:** the [odoo_native_tables/](odoo_native_tables/README.md) folder has ER diagrams of the
> main Odoo 19 apps. Open any of its `.vdoo` files to explore them.

---

## 3. Odoo app designer (Studio)

Studio builds an Odoo app without code: its models, fields, views (form, list, kanban, calendar, pivot, graph and
search), menus and actions. It then exports
the app as an **addon** (a module folder) that you install in Odoo, Community or Enterprise. Apps are saved as
**`.vdooapp`** files.

An app opens in **two tabs** next to the schema tab, so you can work on a schema and an app at the same time:

- **◧ Studio: *app name***: the designer.
- **◈ Diagram: *app name***: the ER diagram of the tables the app's models create. Click a table to open that model
  in Studio, or click a line to open the field behind it. Zoom and Fit work as in the schema editor.

The schema and the app each have their own file, Save, undo history and unsaved-changes dot.

### Creating, opening and closing an app

| To… | Use |
|---|---|
| Create a new app | **Studio › New Odoo app…**, then enter the app name, its first model and the Odoo version, and click **Create** |
| Make an app from the schema | **Studio › Make an Odoo app from the schema diagram…**. Each table becomes a model, each foreign key becomes a many2one field with a one2many back, and every model gets a form, a list and a menu. |
| Try the example | **Studio › Open the example app** (a Purchase Requests app) |
| Open a saved app | **File › Open file…** and pick a `.vdooapp` file, or click one in the **Files** tab |
| Go to the designer / the diagram | Click the tabs, or use **Studio › Open Studio** / **Studio › Open the app's diagram** |
| Save as `.vdooapp` | **File › Save** / **Save as…** or **Ctrl+S** while either app tab is active |
| Copy the app's tables to the schema tab | **Studio › Copy the app's diagram to the schema tab**. The app stays open. |
| Close the app | The **×** on the Studio tab, **Studio › Close the app**, or **Ctrl+W** on an app tab |

> **Older files:** a `.vdoo` file saved with an app inside it (before `.vdooapp` existed) still opens in Studio. Its
> first Save asks for a `.vdooapp` name, and the old file is left untouched.

### Studio's navigation

Studio has its own navigation column on the left (the sidebar steps aside while Studio is showing):

| Item | What it opens |
|---|---|
| **⚙ App settings** | The app's details and a list of its models |
| **☰ Menus & actions** | The menu tree and the window actions |
| ***Model name*** (under **Models**) | The model's **Fields** page. Below it are the model's views (**Form view**, **List view**, **Kanban view** and so on) and **+ Add view ▾** (see [Adding and removing views](#adding-and-removing-views)). A model marked ⊕ extends an existing Odoo model. A red number counts its problems. |
| **+ New model** | Adds a model. Type its description, for example "Equipment". |
| **+ Extend an Odoo model** | Adds fields to an existing Odoo model, such as `res.partner` |
| **</> Generated code** | Every file of the addon, as it will be exported |
| **Export addon…** | Writes the addon folder (see [Exporting the addon](#exporting-the-addon)) |

If the app has problems that would stop Odoo installing it, a **⚠ N problems to fix** bar appears at the top. Click it
to list them, then click a problem to jump to the field concerned.

### App settings

Here you set the app's **Name**, **Technical name** (the addon's folder name), **Odoo version**, **Version**,
**Summary**, **Category**, **Author**, **License** and **Other modules it needs**. The modules `base`, `mail` and those
of related models are added for you. The **Models** table lists every model: click one to open it, or click **Delete**
to remove it with its fields, views and menus.

### Fields

A model's **Fields** page has:

- **Model settings**: **Description**, **Technical name**, **Default order** (for example `date desc`), **Record
  name**, and **Chatter**, which adds messages, followers, activities and tracked changes.
- **The fields table**: label, technical name, type, required, and whether the field is shown on the **form** or
  **list**. **↑** and **↓** reorder fields, and **×** deletes one from the model and every view.
- **+ Add field**: choose a type from the list, then click the button. The types are Text, Multiline text, Rich text,
  Integer, Decimal, Monetary, Checkbox, Date, Date & time, Selection, Many2one, One2many, Many2many, File and Image.
  New fields aren't placed on the views: drag them there in the Form and List designers.
- **Field properties** (right panel, after you click a field):
  - **Label**, **Technical name** and **Type**
  - For relational fields: **Related model**, **Inverse field** (one2many), and **When the related record is deleted** (many2one)
  - **Currency field** (monetary)
  - **Values** for a selection, added with **+ Add a value**
  - **Required**, **Read-only**, **Indexed** and **Track changes** (Track changes needs the chatter)
  - **Default value** and **Help tooltip**

### Form view designer

Open it from **Form view** under a model. The screen has three parts:

- **Left: the palette.** Click an item to add it at the end, or into the selected group or tab, or drag it onto the
  form.
  - **Components**: **Two columns**, **Group**, **Tabs** and **Separator**
  - **New fields**: one of each field type
  - **Existing fields**: the model's fields that aren't on the form yet
- **Middle: the form**, laid out as Odoo will show it. Click any element to select it. The header has these controls:
  - **+ Button**: adds a header button, such as Submit or Approve.
  - **+ Status bar**: shows a selection field as steps.
  - **+ Smart button**: counts and opens related records.
  - **+** on the tab strip: adds a tab.
- **Right: properties** of the selected element:
  - **Field**: **Label**, **Widget**, **Placeholder** and **Hide the label**, plus the **Invisible**, **Required** and
    **Read-only** conditions. **Delete the field** removes it from the model.
  - **Group / tab**: **Title** and an **Invisible** condition. Groups also have **+ Add a column**.
  - **Header button**: **Label**, **Method name** and **Highlighted (primary)**. **When clicked** can set a field to a
    value, for example move `state` to `approved`. Then come **Ask to confirm**, an **Invisible** condition, and buttons
    to move it.
  - **Smart button**: **Opens the records of** (a one2many or many2many field), **Label** and **Icon**.
  - **Nothing selected**: **Chatter** and **Reset to the default layout**.

**Conditions** (Invisible, Required, Read-only) each offer **Never**, **Always** or **When…**. With **When…**, build the
condition from rows of field, operator and value. **+ Add a condition** adds a row and **×** removes one. You can also
click **Edit as code** to type an Odoo expression such as `state != 'draft'`, and **Use the builder** to go back.
Badges on the form show which elements have conditions.

### List view designer

Open it from **List view** under a model.

- **Left: the palette.** It has the model's **Existing fields** and **New fields**. Drag one onto the list, or click
  it to add a column.
- **Middle: the list's columns.** Click one to select it.
- **Right: properties.**
  - **With no column selected:**
    - **Editing**: **Read-only list** (people open a record to edit it), **Editable, new lines at the bottom**, or
      **Editable, new lines at the top**.
    - **Row colours**: **Red**, **Orange**, **Green**, **Blue**, **Grey** and **Bold**, each applied when a condition
      is true.
    - **Reset to the default columns**.
  - **For a column:**
    - **Label** and **Widget**
    - **Optional column**: people can show or hide it from the list's menu.
    - **Show the total** (number fields)
    - **Invisible (cell)**, plus **Required** and **Read-only** when the list is editable
    - **← Move left** / **Move right →** and **Remove**

### Adding and removing views

A new model starts with a form and a list. To give it another kind of view, click **+ Add view ▾** under the model in
Studio's navigation and choose **Kanban**, **Calendar**, **Pivot**, **Graph** or **Search**. The menu lists only the
types the model doesn't have yet. vdoo then does three things:

- creates the view with a starting layout taken from the model's fields
- ticks it in the model's actions, so the app's menus offer it
- opens its designer

To remove a view, open it and click **Remove this view** at the top of its properties panel. The model's actions stop
offering it, and **Ctrl+Z** brings it back.

The new view types are written for **Odoo 19 and later**. If the app's Odoo version is 17.0 or 18.0, Studio lists
this as a problem.

### Kanban view designer

The kanban shows records as cards in columns, as in Odoo's pipelines.

- **Left: the palette.** Click a field (or drag it onto the first card) to add it as a line on the card. **New
  fields** creates the field and adds it.
- **Middle: the board**, with sample cards in each column. Click a line on a card to select it.
- **Right: properties.**
  - **With nothing selected:**
    - **Columns (group by)**: a selection or many2one field. Dragging a card to another column changes the field.
    - **Show every column, even empty ones**: shows a column for every status even when it has no records.
    - **Quick create in a column**: lets people add a record by typing its name in a column.
    - **Card**: **Title**, **Tags** (a many2many shown as coloured tags), **Priority stars** (a selection) and
      **Assignee avatar** (a many2one to users).
    - **Reset to the default layout** and **Remove this view**.
  - **For a card line:** **Widget**, **↑ Move up** / **↓ Move down**, **Remove**, and the field's own settings.

### Calendar view designer

The calendar places each record on the date in one of its fields.

- **Start**: the date or date-and-time field that places the record. It's required.
- **End**: a second field of the same type, for events that last several days or hours.
- **All day**: a checkbox field; when it's ticked, the event fills the whole day.
- **Colour by**: colours the events by a field, for example the person responsible.
- **Opens on**: **Day**, **Week**, **Month** or **Year**.
- **Quick create**: lets people add a record by clicking a day and typing a name.
- **Popover fields**: the fields shown when someone clicks an event. Use **+ Add a field…** to add one, and **↑**,
  **↓** and **×** to order or remove them.

### Pivot view designer

The pivot is a table of totals, like a spreadsheet pivot table.

- **Rows** and **Columns**: the fields to group by. A date field groups by month. Extra fields open as nested levels in
  Odoo.
- **Measures**: number fields, summed in each cell. With none, the cells count records.

### Graph view designer

- **Chart**: **Bar**, **Line** or **Pie**. **Stacked** stacks the bars or lines.
- **Group by**: the first field is the axis, and a second one splits each bar or line into a series.
- **Measure**: the number field to plot, or **Count of records**.

### Search view designer

Every model gets a search view. Without one of its own, vdoo writes a default one from the list's columns. **+ Add
view › Search** starts from that default and lets you change it.

- **Search in**: the fields that typing in the search box looks in.
- **Filters**: predefined filters for the search panel.
  - **+ Condition filter**: give it a **Label**, then build the condition with the same builder as the form's
    conditions, for example *Status is Submitted*. Use `uid` as the value of a user field for "the current user", as
    in a "My requests" filter. The panel shows the domain Odoo will use.
  - **+ Date filter**: choose a date field, and Odoo offers this month, quarter, year and so on for it.
  - Choosing several filters narrows the results, because each filter is in a group of its own.
- **Group By**: the fields offered under Group By.
- Click a filter in the preview or in the list to edit, move or remove it.

### Menus and actions

**☰ Menus & actions** shows:

- **Menus**: a tree in which the top menu is the app's icon on the Odoo home screen.
  - **+ Top menu** adds a top-level menu, and **+ Submenu under…** adds one under the selected menu.
  - In the right panel, set the menu's **Name**, **Under** (its parent), **Opens** (an action, or nothing for a menu
    that holds submenus) and **Sequence** (lower comes first). **Remove** deletes it.
- **Actions**: one row per window action.
  - Each row has a **Name** and a **Model**.
  - **Views** has a checkbox for each view the action can open: list and form, plus every other view the model has.
  - **Default view** chooses the view the menu opens first, for example the kanban.
  - Each row also has a **Domain**, such as `[('state', '!=', 'done')]`, and a **Context**.
  - An action that opens a kanban or calendar the model doesn't have is listed as a problem, because Odoo can't build
    one by itself.
  - **+ Action** adds an action and **×** deletes one.

### Generated code and exporting

- **</> Generated code** lists every file of the addon: the manifest, Python models, XML views and menus, and access
  rules. Click a file to read it, and click **Copy** to copy its contents. The code updates as you design.

#### Exporting the addon

Use **Export addon…** in Studio's navigation or on the Generated code page, the **Export addon…** toolbar button on
the Studio tab, or **File › Export Odoo addon…** / **Studio › Export Odoo addon…**.

1. Pick a folder, such as your Odoo `addons` path. vdoo writes the addon there in a folder named after its technical
   name. If the app still has problems, vdoo warns you first.
2. In Odoo, update the Apps list and install the module, or run `odoo-bin -i <technical_name>`.

Exporting needs the desktop app. In the browser version, copy the files from **Generated code** instead.

---

## 4. Ask AI

The **Ask AI** panel on the right is an assistant that can see the schema or app you're working on. It can review a
design, explain it, or propose a new one.

| To… | Use |
|---|---|
| Show or hide the panel | The **Ask AI** toolbar button or **View › Ask AI**. The **×** in the panel closes it. |
| Choose the provider | The provider list at the top of the panel (Claude, ChatGPT or a custom endpoint), or **Settings › Ask AI** |
| Choose the model | The **Model** list under the message box |
| Ask a question | Type it and click **Send**. Click **Stop** to cancel an answer. |
| Use a suggestion | Click one of the suggested questions, such as "Review this schema for problems" or "Normalize this schema to 3NF" |
| Start over | The **+** (**New conversation**) button at the top of the panel |
| Use the AI's design | Click **Apply to diagram** under a proposed schema. It goes into the schema tab, and **Ctrl+Z** undoes it. If you're on an app tab, vdoo asks first, and the app itself is never changed. |

The first time you use it, the panel walks you through connecting. For Claude, that means **Get Claude Code** and
**Check again**. For ChatGPT it means **Continue with ChatGPT**, and for a custom endpoint, **Open AI settings**.

---

## 5. Files and folders

### The Files pane

- **File › Open folder…**, the **Open folder** button, or **Ctrl+Shift+O** opens a folder as a tree in the sidebar's
  **Files** tab. You can also use **View › Files**.
- Click a folder to expand it, and click a file to open it. The **Refresh** and **Open another folder** buttons sit at
  the top of the pane.
- vdoo reopens the same folder the next time it starts.

### Where each file type opens

| File type | Opens in |
|---|---|
| `.vdoo` | The schema tab (DB schema editor) |
| `.vdooapp` | The **Studio:** and **Diagram:** tabs (Odoo app designer) |
| `.mmd`, `.mermaid` | The schema tab, read from Mermaid. Saving stores it as a `.vdoo` file. |
| `.md`, `.markdown` | A file tab in Markdown mode |
| `.html`, `.htm` | A file tab in rich text mode |
| Anything else (text) | A file tab in text mode |

**What Save does:** it acts on the active tab. On the schema tab it writes `.vdoo`, on either app tab it writes
`.vdooapp`, and on a file tab it writes the file. vdoo never saves an app over a `.vdoo` schema file, or the reverse.

**Limits:** for safety, vdoo only reads and writes inside the folder you opened and the files you picked in a dialog.
It doesn't open binary files, or files over 10 MB.

**Exiting:** **File › Exit**, or close the window. If anything is unsaved (the schema, the app or a file), vdoo lists
it and asks before closing.

---

## 6. Settings

Open **File › Settings…** or the **Settings** toolbar button.

| Section | What you can set |
|---|---|
| **Files** | The **Default directory** where the Open and Save dialogs start. **Choose…** sets it and **Clear** removes it. |
| **Ask AI** | The AI provider. **Claude** uses your Claude subscription through Claude Code, and **Check again** re-detects it. **ChatGPT** uses "Sign in with ChatGPT", with **Sign out**. A **custom endpoint** takes a base URL, an optional key (kept in the OS credential store) and a model. |
| **Odoo** | The Odoo **URL** (for example `http://localhost:8069`), the **admin user** and, optionally, the **database**. **Save** stores them, and **Test connection** asks for the password and signs in. The password is never saved. Addresses must use https, except on this computer or your local network, where vdoo asks before connecting the first time. |

---

## 7. Keyboard shortcuts

| Action | Shortcut |
|---|---|
| New file / New schema | Ctrl+N / Ctrl+Shift+N |
| Open file / Open folder | Ctrl+O / Ctrl+Shift+O |
| Save / Save as (the active tab) | Ctrl+S / Ctrl+Shift+S |
| Close tab (or the app, on an app tab) | Ctrl+W |
| Undo / Redo | Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) |
| Export the file tab as PDF | Ctrl+P |
| Find in the file (Enter: next, Shift+Enter: previous, Esc: close) | Ctrl+F |
| Text / Rich text / Markdown mode | Ctrl+Alt+T / Ctrl+Alt+R / Ctrl+Alt+M |
| Show or hide the sidebar | Ctrl+Shift+B |
| Bold / Italic / Underline (rich text) | Ctrl+B / Ctrl+I / Ctrl+U |
| Bold / Italic / Link (Markdown) | Ctrl+B / Ctrl+I / Ctrl+K |
| Apply Mermaid text, or save the table editor | Ctrl+Enter |
| Zoom the diagram | Ctrl+scroll |
