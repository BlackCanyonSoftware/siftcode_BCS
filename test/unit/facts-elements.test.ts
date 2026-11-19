import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SyntaxParser } from '../../src/languages/parser.js';
import type { GrammarId } from '../../src/languages/registry.js';
import { parseOk } from '../helpers/parse.js';

let parser: SyntaxParser;

beforeAll(async () => {
  parser = await SyntaxParser.create();
});

afterAll(() => {
  parser.dispose();
});

async function elementsOf(grammar: GrammarId, source: string) {
  return (await parseOk(parser, grammar, source)).facts.elements;
}

const SOURCE = `const x = (
  <div className="a" onClick={go} {...rest} tabIndex={3} hidden aria-label='z' data-x={\`t\${y}\`}>
    <img src="a.png" alt="" />
    text here
    {cond && <b>x</b>}
    <Foo.Bar />
    <label><input type="text" id={id} /></label>
  </div>
);`;

describe('JSX element facts (US-020)', () => {
  it('records the tag, line, and how each attribute is given', async () => {
    const [div] = await elementsOf('tsx', SOURCE);

    expect(div?.tag).toBe('div');
    expect(div?.line).toBe(2);
    expect(div?.attributes).toEqual([
      { name: 'className', value: 'string', text: 'a' },
      { name: 'onClick', value: 'expression', text: '{go}' },
      { name: 'tabIndex', value: 'number', text: '3' },
      { name: 'hidden', value: 'none', text: '' },
      { name: 'aria-label', value: 'string', text: 'z' },
      { name: 'data-x', value: 'expression', text: '{`t${y}`}' },
    ]);
    expect(div?.hasSpread).toBe(true);
    expect(div?.selfClosing).toBe(false);
  });

  it('records what is inside an element: text, expressions, and child tags', async () => {
    const [div] = await elementsOf('tsx', SOURCE);

    expect(div?.children).toEqual({
      text: true,
      expressions: 1,
      elements: ['img', 'Foo.Bar', 'label'],
    });
  });

  it('records the tags an element is inside, nearest first, and self-closing elements', async () => {
    const elements = await elementsOf('tsx', SOURCE);

    const input = elements.find((element) => element.tag === 'input');
    expect(input?.ancestors).toEqual(['label', 'div']);
    expect(input?.selfClosing).toBe(true);
    expect(input?.children).toEqual({ text: false, expressions: 0, elements: [] });
    expect(elements.map((element) => element.tag)).toEqual([
      'div',
      'img',
      'b',
      'Foo.Bar',
      'label',
      'input',
    ]);
  });

  it('reads JSX in a JavaScript file, and finds none in Python or C#', async () => {
    const js = await elementsOf('javascript', 'const a = <img src="x.png" />;');
    const py = await elementsOf('python', 'x = 1\n');
    const cs = await elementsOf('csharp', 'class A { }\n');

    expect(js.map((element) => element.tag)).toEqual(['img']);
    expect(py).toEqual([]);
    expect(cs).toEqual([]);
  });
});
