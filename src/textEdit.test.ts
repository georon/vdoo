// Ported from dexed's tests/edit.test.js.
import { assert, describe, test } from "vitest";
import * as E from "./textEdit";

// Run a toolbar action on `value` with selection [s, e]; return the new text and selected text.
function run(action: string, value: string, s = 0, e = s) {
  const edit = E.markdownEdit(action, value, s, e)
  assert.ok(edit, `no edit for ${action}`)
  if (!edit) throw new Error('unreachable')
  const out = E.applyEdit(value, edit)
  return { out, sel: out.slice(edit.start + edit.selStart, edit.start + edit.selEnd) }
}

describe('modeForPath', () => {
  test('picks the mode from the file extension', () => {
    assert.strictEqual(E.modeForPath('/a/notes.md'), 'markdown')
    assert.strictEqual(E.modeForPath('/a/NOTES.MARKDOWN'), 'markdown')
    assert.strictEqual(E.modeForPath('/a/page.html'), 'rich')
    assert.strictEqual(E.modeForPath('/a/page.HTM'), 'rich')
    assert.strictEqual(E.modeForPath('/a/readme.txt'), 'text')
    assert.strictEqual(E.modeForPath('/a/Makefile'), 'text')
  })
  test('untitled (no path) is text', () => {
    assert.strictEqual(E.modeForPath(null), 'text')
    assert.strictEqual(E.modeForPath(undefined), 'text')
  })
  test('only matches the final extension', () => {
    assert.strictEqual(E.modeForPath('/a/md.txt'), 'text')
    assert.strictEqual(E.modeForPath('/a/x.html.bak'), 'text')
  })
  test('schema files are recognised', () => {
    assert.strictEqual(E.isSchemaPath('/a/shop.vdoo'), true)
    assert.strictEqual(E.isSchemaPath('/a/shop.MMD'), true)
    assert.strictEqual(E.isSchemaPath('/a/shop.md'), false)
  })
  test('every mode has a default file name', () => {
    assert.deepEqual(Object.keys(E.DEFAULT_NAMES).sort(), ['markdown', 'rich', 'text'])
  })
})

describe('baseName', () => {
  test('handles posix and windows separators', () => {
    assert.strictEqual(E.baseName('/home/ron/a.md'), 'a.md')
    assert.strictEqual(E.baseName('~\\a.md'), 'a.md')
  })
  test('falls back to Untitled', () => {
    assert.strictEqual(E.baseName(null), 'Untitled')
  })
})

describe('plain text <-> rich view helpers', () => {
  test('looksLikeHtml', () => {
    assert.strictEqual(E.looksLikeHtml('<p>hi</p>'), true)
    assert.strictEqual(E.looksLikeHtml('a <b>b</b>'), true)
    assert.strictEqual(E.looksLikeHtml('1 < 2 and 3 > 2'), false)
    assert.strictEqual(E.looksLikeHtml('plain\ntext'), false)
    assert.strictEqual(E.looksLikeHtml('line <two> and List<String>'), false)
    assert.strictEqual(E.looksLikeHtml('x<br>y'), true)
  })
  test('plainToHtml escapes markup and keeps line breaks', () => {
    assert.strictEqual(E.plainToHtml('a & b'), 'a &amp; b')
    assert.strictEqual(E.plainToHtml('1 < 2'), '1 &lt; 2')
    assert.strictEqual(E.plainToHtml('l1\nl2'), 'l1<br>l2')
  })
  test('plainToHtml escapes ampersand first (no double escaping of its own output)', () => {
    assert.strictEqual(E.plainToHtml('<'), '&lt;')
  })
})

describe('inline wrapping', () => {
  test('wraps the selection and keeps it selected', () => {
    const r = run('bold', 'make this loud', 5, 9)
    assert.strictEqual(r.out, 'make **this** loud')
    assert.strictEqual(r.sel, 'this')
  })
  test('inserts a selected placeholder when nothing is selected', () => {
    const r = run('italic', 'ab', 1)
    assert.strictEqual(r.out, 'a*italic*b')
    assert.strictEqual(r.sel, 'italic')
  })
  test('strike, code and image', () => {
    assert.strictEqual(run('strike', 'x', 0, 1).out, '~~x~~')
    assert.strictEqual(run('code', 'x', 0, 1).out, '`x`')
    assert.strictEqual(run('image', 'pic', 0, 3).out, '![pic](url)')
  })
  test('link uses the selection as label and selects the url placeholder', () => {
    const r = run('link', 'see docs here', 4, 8)
    assert.strictEqual(r.out, 'see [docs](url) here')
    assert.strictEqual(r.sel, 'url')
  })
  test('link with no selection uses a placeholder label', () => {
    const r = run('link', '')
    assert.strictEqual(r.out, '[link text](url)')
    assert.strictEqual(r.sel, 'url')
  })
})

describe('headings', () => {
  test('adds a heading to the current line only', () => {
    assert.strictEqual(run('h2', 'one\ntwo\nthree', 5).out, 'one\n## two\nthree')
  })
  test('toggles off when the line already has that heading', () => {
    assert.strictEqual(run('h2', '## title', 3).out, 'title')
  })
  test('switches between heading levels instead of stacking', () => {
    assert.strictEqual(run('h3', '# title', 0).out, '### title')
    assert.strictEqual(run('h1', '### title', 0).out, '# title')
  })
  test('H2 is not mistaken for an existing H3 when toggling', () => {
    assert.strictEqual(run('h2', '### title', 0).out, '## title')
  })
  test('applies to every line touched by a multi-line selection', () => {
    assert.strictEqual(run('h1', 'a\nb\nc', 0, 3).out, '# a\n# b\nc')
  })
})

describe('lists and quotes', () => {
  test('bullet list on several lines, then toggled off', () => {
    const on = run('ul', 'a\nb', 0, 3).out
    assert.strictEqual(on, '- a\n- b')
    assert.strictEqual(run('ul', on, 0, on.length).out, 'a\nb')
  })
  test('numbered list counts up', () => {
    assert.strictEqual(run('ol', 'a\nb\nc', 0, 5).out, '1. a\n2. b\n3. c')
  })
  test('switching list type replaces the old marker', () => {
    assert.strictEqual(run('ol', '- a\n- b', 0, 7).out, '1. a\n2. b')
    assert.strictEqual(run('ul', '1. a', 0).out, '- a')
  })
  test('task list, and a task line is not treated as a plain bullet', () => {
    assert.strictEqual(run('task', 'todo', 0).out, '- [ ] todo')
    assert.strictEqual(run('ul', '- [ ] todo', 0).out, '- todo')
    assert.strictEqual(run('task', '- [x] done', 0).out, 'done')
  })
  test('quote adds and removes', () => {
    assert.strictEqual(run('quote', 'hi', 0).out, '> hi')
    assert.strictEqual(run('quote', '> hi', 0).out, 'hi')
  })
  test('selection ending at line end does not touch the next line', () => {
    assert.strictEqual(run('ul', 'a\nb', 0, 1).out, '- a\nb')
  })
})

describe('block inserts', () => {
  test('code block wraps the selection in a fence', () => {
    const r = run('codeblock', 'x = 1', 0, 5)
    assert.strictEqual(r.out, '```\nx = 1\n```\n')
    assert.strictEqual(r.sel, 'x = 1')
  })
  test('code block with no selection selects a placeholder', () => {
    assert.strictEqual(run('codeblock', '').sel, 'code')
  })
  test('starts on a new line when the cursor is mid-line', () => {
    assert.strictEqual(run('hr', 'abc', 3).out, 'abc\n\n---\n')
    assert.strictEqual(run('hr', 'abc\n', 4).out, 'abc\n\n---\n')
  })
  test('table inserts a header, separator and row and selects the first header', () => {
    const r = run('table', '')
    assert.strictEqual(r.out.split('\n')[1], '| --- | --- |')
    assert.strictEqual(r.sel, 'Column 1')
  })
})

describe('markdownEdit', () => {
  test('returns null for non-edit actions', () => {
    assert.strictEqual(E.markdownEdit('undo', '', 0, 0), null)
    assert.strictEqual(E.markdownEdit('nope', '', 0, 0), null)
  })
  test('is pure: does not depend on or mutate anything between calls', () => {
    const a = E.markdownEdit('bold', 'hi', 0, 2)
    const b = E.markdownEdit('bold', 'hi', 0, 2)
    assert.deepEqual(a, b)
  })
})
