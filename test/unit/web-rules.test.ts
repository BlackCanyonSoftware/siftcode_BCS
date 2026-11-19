import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

/** The messages of rule `id` for one component file. */
async function messages(id: string, jsx: string, path = 'src/App.tsx'): Promise<string[]> {
  const folder = await projects.create({ [path]: `export const A = () => (\n${jsx}\n);\n` });
  return (await scan(folder, { config: onlyRule(id) })).findings.map((f) => f.message);
}

describe('SC-WEB-001 image without alt (US-045, WCAG 1.1.1)', () => {
  it.each([
    ['an img', '<img src="a.png" />', '<img> has no alt attribute.'],
    ['an image input', '<input type="image" src="go.png" />', '<input> has no alt attribute.'],
  ])('flags %s', async (_name, jsx, message) => {
    expect(await messages('SC-WEB-001', jsx)).toEqual([message]);
  });

  it('flags Next.js Image only when it is imported from next/image', async () => {
    const folder = await projects.create({
      'a.tsx': 'import Image from \'next/image\';\nexport const A = () => <Image src="a.png" />;\n',
      'b.tsx': 'export const B = () => <Image src="b.png" />;\n',
    });

    const findings = (await scan(folder, { config: onlyRule('SC-WEB-001') })).findings;

    expect(findings.map((f) => f.path)).toEqual(['a.tsx']);
  });

  it.each([
    ['an alt text', '<img src="a.png" alt="A chart" />'],
    ['an empty alt, which marks decoration', '<img src="a.png" alt="" />'],
    ['an alt given by an expression', '<img src="a.png" alt={label} />'],
    ['spread props, which may carry the alt', '<img src="a.png" {...props} />'],
    ['a component that is not the DOM element', '<Img src="a.png" />'],
    ['a text input', '<input type="text" />'],
  ])('does not flag %s', async (_name, jsx) => {
    expect(await messages('SC-WEB-001', jsx)).toEqual([]);
  });

  it('reads JSX in .jsx and .js files, and skips tests, stories, and vendored code', async () => {
    const jsx = 'export const A = () => <img src="a.png" />;\n';
    const folder = await projects.create({
      'a.jsx': jsx,
      'b.js': jsx,
      'a.test.tsx': jsx,
      'a.stories.tsx': jsx,
      'vendor/c.jsx': jsx,
    });

    const findings = (await scan(folder, { config: onlyRule('SC-WEB-001') })).findings;

    expect(findings.map((f) => f.path)).toEqual(['a.jsx', 'b.js']);
  });
});

describe('SC-WEB-002 click handler on an element a keyboard cannot use (US-045, WCAG 2.1.1)', () => {
  it('flags a div with an onClick and no role', async () => {
    expect(await messages('SC-WEB-002', '<div onClick={close}>x</div>')).toEqual([
      '<div> has an onClick handler but no role, so a screen reader does not announce it as something to operate and the keyboard cannot reach it.',
    ]);
  });

  it.each([
    [
      'no tabIndex and no key handler',
      '<span role="button" onClick={go}>x</span>',
      '<span> has an onClick handler and role="button", but no tabIndex and no key handler, so a keyboard can neither reach nor operate it.',
    ],
    [
      'no key handler',
      '<div role="button" tabIndex={0} onClick={go}>x</div>',
      '<div> has an onClick handler and role="button", but no key handler, so a keyboard cannot operate it.',
    ],
  ])('flags a role that says "operate me" with %s', async (_name, jsx, message) => {
    expect(await messages('SC-WEB-002', jsx)).toEqual([message]);
  });

  it.each([
    ['a button', '<button onClick={go}>x</button>'],
    ['a link', '<a href="/x" onClick={go}>x</a>'],
    [
      'a role with focus and a key handler',
      '<div role="button" tabIndex={0} onClick={go} onKeyDown={key}>x</div>',
    ],
    [
      'an empty overlay that closes a dialog when clicked (found in Excalidraw)',
      '<div className="backdrop" onClick={close} />',
    ],
    ['an empty element with a closing tag', '<div onClick={close}></div>'],
    [
      'a wrapper that only passes the click to its field (found in Excalidraw)',
      '<div onClick={() => ref.current?.focus()}><input aria-label="n" /></div>',
    ],
    ['a guard against clicks behind it', '<div onClick={(e) => e.stopPropagation()}>x</div>'],
    ['a role that is not operable', '<div role="presentation" onClick={go}>x</div>'],
    ['spread props', '<div onClick={go} {...rest}>x</div>'],
    ['a component', '<Card onClick={go}>x</Card>'],
    ['a div with no handler', '<div>x</div>'],
  ])('does not flag %s', async (_name, jsx) => {
    expect(await messages('SC-WEB-002', jsx)).toEqual([]);
  });
});

describe('SC-WEB-003 tabIndex above zero (US-045, WCAG 2.4.3)', () => {
  it.each(['tabIndex={3}', 'tabIndex="2"'])('flags %s', async (attribute) => {
    const [message] = await messages('SC-WEB-003', `<div ${attribute}>x</div>`);

    expect(message).toContain('<div> has tabIndex');
  });

  it.each(['tabIndex={0}', 'tabIndex={-1}', 'tabIndex={order}', 'id="a"'])(
    'does not flag %s',
    async (attribute) => {
      expect(await messages('SC-WEB-003', `<div ${attribute}>x</div>`)).toEqual([]);
    },
  );
});

describe('SC-WEB-004 form field without a label (US-045, WCAG 3.3.2)', () => {
  it.each([
    ['an input with only a placeholder', '<input type="email" placeholder="Email" />'],
    ['a select with nothing', '<select><option>a</option></select>'],
    ['a textarea', '<textarea />'],
    ['an input whose id no label names', '<input id="a" /><label htmlFor="b">B</label>'],
  ])('flags %s', async (_name, jsx) => {
    const found = await messages('SC-WEB-004', `<form>${jsx}</form>`);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^<(input|select|textarea)> has no label/);
  });

  it.each([
    ['an aria-label', '<input aria-label="Search" />'],
    ['aria-labelledby', '<input aria-labelledby="t" />'],
    ['a title', '<input title="Search" />'],
    ['a label around it', '<label>Name <input /></label>'],
    ['a label for its id', '<label htmlFor="n">Name</label><input id="n" />'],
    ['an id made at run time', '<input id={useId()} />'],
    ['a label that points through an expression', '<label htmlFor={f}>N</label><input id="n" />'],
    [
      'a file input that is hidden and opened from code (found in Mastodon)',
      '<input hidden type="file" ref={ref} />',
    ],
    ['a hidden input', '<input type="hidden" name="t" />'],
    ['buttons', '<input type="submit" /><input type="button" value="Go" />'],
    ['a type that is not known', '<input type={kind} />'],
    ['spread props', '<input {...register("a")} />'],
    ['a component', '<TextField />'],
  ])('does not flag %s', async (_name, jsx) => {
    expect(await messages('SC-WEB-004', `<form>${jsx}</form>`)).toEqual([]);
  });
});

describe('SC-WEB-005 button or link with no text (US-045, WCAG 4.1.2)', () => {
  it.each([
    ['an empty button', '<button onClick={close}></button>'],
    ['a self-closing button', '<button />'],
    ['an empty link', '<a href="/home"></a>'],
  ])('flags %s', async (_name, jsx) => {
    const found = await messages('SC-WEB-005', jsx);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/has nothing inside it and no aria-label/);
  });

  it.each([
    ['text', '<button>Save</button>'],
    ['an expression', '<button>{label}</button>'],
    ['an icon', '<button><Icon /></button>'],
    ['an aria-label', '<button aria-label="Close"></button>'],
    ['a title', '<a href="/" title="Home"></a>'],
    ['a link with no href, which is an anchor', '<a name="top"></a>'],
    ['spread props', '<button {...props} />'],
  ])('does not flag %s', async (_name, jsx) => {
    expect(await messages('SC-WEB-005', jsx)).toEqual([]);
  });
});

describe('SC-WEB-006 page without a language (US-045, WCAG 3.1.1)', () => {
  it('flags an html element with no lang, as in a Next.js layout', async () => {
    expect(await messages('SC-WEB-006', '<html><body>x</body></html>', 'app/layout.tsx')).toEqual([
      '<html> has no lang attribute.',
    ]);
  });

  it.each(['<html lang="en"><body /></html>', '<html lang={locale}><body /></html>'])(
    'does not flag %s',
    async (jsx) => {
      expect(await messages('SC-WEB-006', jsx, 'app/layout.tsx')).toEqual([]);
    },
  );
});

describe('the accessibility rules are not run on other languages', () => {
  it('find nothing in Python and C# files', async () => {
    const folder = await projects.create({
      'a.py': 'x = "<img src=a>"\n',
      'A.cs': 'class A { }\n',
    });

    for (const id of ['SC-WEB-001', 'SC-WEB-002', 'SC-WEB-004', 'SC-WEB-005']) {
      expect((await scan(folder, { config: onlyRule(id) })).findings).toEqual([]);
    }
  });
});
