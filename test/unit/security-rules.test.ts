import { describe, expect, it } from 'vitest';
import { scan } from '../../src/core/scan.js';
import { ALL_RULES } from '../../src/rules/index.js';
import { onlyRule, useProjects } from '../helpers/project.js';

const projects = useProjects();

/** Scans `files` with only `id` switched on and returns the finding messages. */
async function messagesFor(
  id: string,
  files: Record<string, string>,
  options: object = {},
): Promise<string[]> {
  const folder = await projects.create(files);
  const result = await scan(folder, { config: onlyRule(id, options) });
  return result.findings.map((finding) => finding.message);
}

// Credential-shaped strings are built here at run time, so no such string is ever committed.
const AWS_KEY = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
const GITHUB_TOKEN = ['gh', 'p_', 'a'.repeat(36)].join('');
const SLACK_TOKEN = ['xo', 'xb-', '1234567890-abcdefghij'].join('');
const STRIPE_KEY = ['sk_', 'live_', 'a'.repeat(24)].join('');
const GOOGLE_KEY = ['AI', 'za', 'a'.repeat(35)].join('');
const PRIVATE_KEY_HEADER = ['-----BEGIN ', 'RSA PRIVATE KEY', '-----'].join('');
const URL_WITH_PASSWORD = ['postgres://admin', ':', 'S3cr3tPassw0rd', '@db.example.com/app'].join(
  '',
);

describe('SC-SEC-001 hardcoded credentials (US-030, CWE-798)', () => {
  it.each([
    ['an AWS access key ID', AWS_KEY],
    ['a GitHub token', GITHUB_TOKEN],
    ['a Slack token', SLACK_TOKEN],
    ['a Stripe live key', STRIPE_KEY],
    ['a Google API key', GOOGLE_KEY],
    ['a private key', PRIVATE_KEY_HEADER],
  ])('finds %s in every language, and never repeats it', async (label, secret) => {
    const files = {
      'a.js': `const v = '${secret}';\n`,
      'a.py': `v = "${secret}"\n`,
      'A.cs': `class K { string v = "${secret}"; }\n`,
    };

    const messages = await messagesFor('SC-SEC-001', files);

    expect(messages).toEqual([
      `A string that looks like ${label} is written into the code.`,
      `A string that looks like ${label} is written into the code.`,
      `A string that looks like ${label} is written into the code.`,
    ]);
    expect(messages.join('\n')).not.toContain(secret);
  });

  it('reports a recognizable credential as an error, even in test code', async () => {
    const folder = await projects.create({
      'tests/fixture.js': `module.exports = '${AWS_KEY}';\n`,
    });

    const result = await scan(folder, { config: onlyRule('SC-SEC-001') });

    expect(result.findings.map((f) => f.severity)).toEqual(['error']);
  });

  it('finds a password inside a URL, but not a URL without one or with a placeholder', async () => {
    const messages = await messagesFor('SC-SEC-001', {
      'a.js': [
        `const a = '${URL_WITH_PASSWORD}';`,
        "const b = 'https://example.com/some/long/path/here';",
        "const c = 'postgres://user:password@localhost/database_name';",
      ].join('\n'),
    });

    expect(messages).toEqual(['A URL with a password in it is written into the code.']);
  });

  it.each([
    ['JavaScript', 'a.js', 'const password = "hunter2hunter2";\n'],
    ['a property', 'a.js', 'cfg.apiKey = "hunter2hunter2";\n'],
    ['an object entry', 'a.js', 'const o = { client_secret: "hunter2hunter2" };\n'],
    ['Python', 'a.py', 'password = "hunter2hunter2"\n'],
    ['a Python attribute', 'a.py', 'self.api_key = "hunter2hunter2"\n'],
    ['a Python dictionary', 'a.py', 'd = {"secret": "hunter2hunter2"}\n'],
    ['a keyword argument', 'a.py', 'connect(password="hunter2hunter2")\n'],
    ['a C# field', 'A.cs', 'class K { string Password = "hunter2hunter2"; }\n'],
    [
      'a C# object initializer',
      'A.cs',
      'class K { void M() { var c = new C { ApiKey = "hunter2hunter2" }; } }\n',
    ],
    [
      'a name that says token, with a random-looking value',
      'a.js',
      'const token = "a1B2c3D4e5F6g7H8i9";\n',
    ],
  ])('guesses from a secret-looking name: %s', async (_name, file, source) => {
    const messages = await messagesFor('SC-SEC-001', { [file]: source });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^"\w+" is given a fixed value that looks like a credential\.$/);
    expect(messages[0]).not.toContain('hunter2');
  });

  it.each([
    ['a placeholder', 'const password = "changeme";'],
    ['a template placeholder', 'const password = "${PASSWORD}";'],
    ['an angle-bracket placeholder', 'const password = "<your password>";'],
    ['text with spaces', 'const password = "enter your password";'],
    ['a short value', 'const password = "abc123";'],
    ['a repetitive value', 'const password = "aaaaaaaaaa";'],
    [
      'the name of an environment variable',
      'const TOKEN_ENV = "GITHUB_ACCESS_TOKEN"; const secret = "MY_APP_SECRET";',
    ],
    [
      'a description of a credential, not one',
      'const tokenUrl = "https://example.com/oauth/token"; const passwordField = "passwordInput";',
    ],
    ['a lexer token', 'const lastToken = "StringLiteral";'],
    ['a fetch option', 'fetch(u, { credentials: "same-origin" });'],
    ['a value read from the environment', 'const password = process.env.DB_PASSWORD;'],
    ['a name that is not about secrets', 'const username = "hunter2hunter2";'],
  ])('does not report %s', async (_name, source) => {
    expect(await messagesFor('SC-SEC-001', { 'a.js': `${source}\n` })).toEqual([]);
  });

  it('does not guess from names in test code, and the limit is an option', async () => {
    const test = await messagesFor('SC-SEC-001', {
      'tests/a.test.js': 'const password = "hunter2hunter2";\n',
    });
    const longer = await messagesFor(
      'SC-SEC-001',
      { 'a.js': 'const password = "hunter2hunter2";\n' },
      { minLength: 20 },
    );

    expect(test).toEqual([]);
    expect(longer).toEqual([]);
  });
});

describe('SC-SEC-002 SQL injection (US-030, CWE-89)', () => {
  it.each([
    ['JavaScript concatenation', 'a.js', "db.query('SELECT * FROM t WHERE id=' + id);", 'db.query'],
    ['a JavaScript template', 'a.js', 'db.query(`SELECT * FROM t WHERE id=${id}`);', 'db.query'],
    [
      'through a JavaScript variable',
      'a.js',
      "function f(id) { const sql = 'DELETE FROM t WHERE id=' + id; return db.run(sql) && db.query(sql); }",
      'db.query',
    ],
    [
      'Python concatenation',
      'a.py',
      'cursor.execute("SELECT * FROM t WHERE id=" + uid)',
      'cursor.execute',
    ],
    [
      'Python % formatting',
      'a.py',
      'cursor.execute("SELECT * FROM t WHERE id=%s" % uid)',
      'cursor.execute',
    ],
    [
      'a Python f-string',
      'a.py',
      'cursor.execute(f"SELECT * FROM t WHERE id={uid}")',
      'cursor.execute',
    ],
    [
      'Python str.format',
      'a.py',
      'cursor.execute("SELECT * FROM t WHERE id={}".format(uid))',
      'cursor.execute',
    ],
    [
      'through a Python variable',
      'a.py',
      'def f(uid):\n    q = "UPDATE t SET a=1 WHERE id=" + uid\n    cursor.execute(q)',
      'cursor.execute',
    ],
    [
      'C# concatenation',
      'A.cs',
      'class K { void M() { cmd.ExecuteReader("SELECT * FROM t WHERE id=" + id); } }',
      'cmd.ExecuteReader',
    ],
    [
      'a C# interpolated string',
      'A.cs',
      'class K { void M() { cmd.ExecuteNonQuery($"DELETE FROM t WHERE id={id}"); } }',
      'cmd.ExecuteNonQuery',
    ],
    [
      'a C# command object',
      'A.cs',
      'class K { void M() { var c = new SqlCommand("SELECT * FROM t WHERE id=" + id, conn); } }',
      'SqlCommand',
    ],
  ])('flags %s', async (_name, file, source, callee) => {
    const messages = await messagesFor('SC-SEC-002', { [file]: source });

    expect(messages).toEqual([`${callee}() runs an SQL statement that is built from a variable.`]);
  });

  it('flags CommandText set to a built statement', async () => {
    const messages = await messagesFor('SC-SEC-002', {
      'A.cs': 'class K { void M() { cmd.CommandText = "SELECT * FROM t WHERE id=" + id; } }',
    });

    expect(messages).toEqual([
      'CommandText is set to an SQL statement that is built from a variable.',
    ]);
  });

  it.each([
    [
      'parameters passed separately (Python)',
      'a.py',
      'cursor.execute("SELECT * FROM t WHERE id=%s", (uid,))',
    ],
    ['parameters (JavaScript)', 'a.js', "db.query('SELECT * FROM t WHERE id=?', [id]);"],
    ['a constant statement', 'a.js', "db.query('SELECT * FROM t');"],
    ['a tagged template', 'a.js', 'db.query(sql`SELECT * FROM t WHERE id=${id}`);'],
    ['a built string that is not SQL', 'a.py', 'cursor.execute("hello " + name)'],
    ['a constant that is built from constants', 'a.js', "db.query('SELECT * ' + 'FROM t');"],
    [
      'an SQL C# command with a constant',
      'A.cs',
      'class K { void M() { var c = new SqlCommand("SELECT * FROM t", conn); } }',
    ],
  ])('does not flag %s', async (_name, file, source) => {
    expect(await messagesFor('SC-SEC-002', { [file]: source })).toEqual([]);
  });

  it('does not apply to test code', async () => {
    const messages = await messagesFor('SC-SEC-002', {
      'tests/a.test.js': "db.query('SELECT * FROM t WHERE id=' + id);",
    });

    expect(messages).toEqual([]);
  });
});

describe('SC-SEC-003 command injection (US-030, CWE-78)', () => {
  it.each([
    [
      'exec from a require',
      'a.js',
      "const { exec } = require('child_process');\nexec('ls ' + dir);",
      'exec',
    ],
    [
      'a member of a required module',
      'a.js',
      "const exec = require('child_process').exec;\nexec(cmd);",
      'exec',
    ],
    [
      'an aliased module',
      'a.js',
      "import * as cp from 'node:child_process';\ncp.execSync(`rm ${file}`);",
      'cp.execSync',
    ],
    [
      'spawn with a shell',
      'a.js',
      "const cp = require('child_process');\ncp.spawn(cmd, { shell: true });",
      'cp.spawn',
    ],
    ['os.system', 'a.py', 'import os\nos.system("ls " + d)', 'os.system'],
    ['os.popen', 'a.py', 'import os\nos.popen(cmd)', 'os.popen'],
    [
      'subprocess with a shell',
      'a.py',
      'import subprocess\nsubprocess.run(cmd, shell=True)',
      'subprocess.run',
    ],
    [
      'Process.Start',
      'A.cs',
      'using System.Diagnostics;\nclass K { void M() { Process.Start("cmd", "/c " + arg); } }',
      'Process.Start',
    ],
    [
      'ProcessStartInfo',
      'A.cs',
      'using System.Diagnostics;\nclass K { void M() { var i = new ProcessStartInfo("cmd", $"/c {arg}"); } }',
      'ProcessStartInfo',
    ],
  ])('flags %s', async (_name, file, source, callee) => {
    const messages = await messagesFor('SC-SEC-003', { [file]: source });

    expect(messages).toEqual([`${callee}() runs a command that is built from a variable.`]);
  });

  it.each([
    [
      'a regular expression exec in a file that imports child_process',
      'a.js',
      "const cp = require('child_process');\nconst m = /a(b)/.exec(text);\ncp.execSync('ls');",
    ],
    ['a constant command', 'a.js', "const { exec } = require('child_process');\nexec('ls -l');"],
    [
      'spawn without a shell',
      'a.js',
      "const cp = require('child_process');\ncp.spawn(cmd, ['-l']);",
    ],
    ['a file that does not import child_process', 'a.js', 'exec(cmd);'],
    ['os.system with a constant', 'a.py', 'import os\nos.system("ls")'],
    ['an argument list without a shell', 'a.py', 'import subprocess\nsubprocess.run(["ls", d])'],
    ['a variable command without a shell', 'a.py', 'import subprocess\nsubprocess.run(cmd)'],
    [
      'a constant list with a shell',
      'a.py',
      'import subprocess\nsubprocess.run(["ls", "-l"], shell=True)',
    ],
    [
      'a constant C# command',
      'A.cs',
      'using System.Diagnostics;\nclass K { void M() { Process.Start("notepad.exe"); } }',
    ],
  ])('does not flag %s', async (_name, file, source) => {
    expect(await messagesFor('SC-SEC-003', { [file]: source })).toEqual([]);
  });

  // Found on OWASP WebGoat.NET: the object-initializer and property-assignment forms
  it.each([
    [
      'an object initializer with a concatenated argument list',
      'using System.Diagnostics;\nclass K { void M(string u) { var i = new ProcessStartInfo { FileName = "sh", Arguments = "-c " + u }; } }',
      ['ProcessStartInfo.Arguments is built from a variable.'],
    ],
    [
      'an interpolated file name in a multi-line initializer',
      'using System.Diagnostics;\nclass K {\n  void M(string u) {\n    var i = new ProcessStartInfo\n    {\n      FileName = $"{u}.exe",\n      UseShellExecute = false,\n    };\n  }\n}',
      ['ProcessStartInfo.FileName is built from a variable.'],
    ],
    [
      'a property assignment',
      'using System.Diagnostics;\nclass K { void M(string u) { var i = new ProcessStartInfo("sh"); i.Arguments = $"-c {u}"; } }',
      ['ProcessStartInfo.Arguments is built from a variable.'],
    ],
  ])('flags %s in C#', async (_name, source, expected) => {
    expect(await messagesFor('SC-SEC-003', { 'A.cs': source })).toEqual(expected);
  });

  it.each([
    [
      'constant properties',
      'using System.Diagnostics;\nclass K { void M() { var i = new ProcessStartInfo { FileName = "git", Arguments = "status" }; } }',
    ],
    [
      'a plain variable (that needs data-flow analysis, TD-12)',
      'using System.Diagnostics;\nclass K { void M(string cmd, string a) { var i = new ProcessStartInfo { FileName = cmd, Arguments = a }; } }',
    ],
    [
      'the same property names in a file that does not use System.Diagnostics',
      'class K { void M(string u) { var i = new Options { FileName = "a" + u, Arguments = $"{u}" }; } }',
    ],
  ])('does not flag %s in C#', async (_name, source) => {
    expect(await messagesFor('SC-SEC-003', { 'A.cs': source })).toEqual([]);
  });
});

describe('SC-SEC-004 dynamic code evaluation (US-030, CWE-95)', () => {
  it.each([
    ['eval', 'a.js', 'eval(code);', 'eval'],
    ['new Function', 'a.js', "new Function('a', body);", 'new Function'],
    ['vm.runInNewContext', 'a.js', 'vm.runInNewContext(code);', 'vm.runInNewContext'],
    ['Python eval', 'a.py', 'eval(expression)', 'eval'],
    ['Python exec', 'a.py', 'exec(source)', 'exec'],
    [
      'C# scripting',
      'A.cs',
      'class K { void M() { CSharpScript.EvaluateAsync(code); } }',
      'CSharpScript.EvaluateAsync',
    ],
  ])('flags %s', async (_name, file, source, callee) => {
    const messages = await messagesFor('SC-SEC-004', { [file]: source });

    expect(messages).toEqual([`${callee}() runs code that is built at run time.`]);
  });

  it.each([
    ['eval of a constant', 'a.js', "eval('1 + 1');"],
    ['new Function with a constant body', 'a.js', "new Function('return 1');"],
    ['ast.literal_eval', 'a.py', 'import ast\nast.literal_eval(text)'],
    ['compile, which does not run code', 'a.py', 'compile(source, "f", "exec")'],
    ['exec of a constant', 'a.py', 'exec("x = 1")'],
  ])('does not flag %s', async (_name, file, source) => {
    expect(await messagesFor('SC-SEC-004', { [file]: source })).toEqual([]);
  });
});

describe('SC-SEC-005 weak cryptography (US-030, CWE-327, CWE-328)', () => {
  it.each([
    [
      'createHash md5',
      'a.js',
      "crypto.createHash('md5');",
      'MD5 is a weak hash: use SHA-256 or stronger instead.',
    ],
    [
      'createHash sha1',
      'a.js',
      "createHash('sha1');",
      'SHA1 is a weak hash: use SHA-256 or stronger instead.',
    ],
    [
      'a DES cipher',
      'a.js',
      "crypto.createCipheriv('des-cbc', key, iv);",
      'DES-CBC is a weak cipher: use AES-GCM instead.',
    ],
    [
      'ECB mode',
      'a.js',
      "crypto.createCipheriv('aes-128-ecb', key, null);",
      'AES-128-ECB (ECB mode) is a weak cipher: use AES-GCM instead.',
    ],
    [
      'hashlib.md5',
      'a.py',
      'hashlib.md5(data)',
      'MD5 is a weak hash: use SHA-256 or stronger instead.',
    ],
    [
      'hashlib.new',
      'a.py',
      'hashlib.new("sha1")',
      'SHA1 is a weak hash: use SHA-256 or stronger instead.',
    ],
    ['DES.new', 'a.py', 'DES.new(key, DES.MODE_CBC)', 'DES is a weak cipher: use AES-GCM instead.'],
    [
      'AES in ECB mode',
      'a.py',
      'AES.new(key, AES.MODE_ECB)',
      'AES in ECB mode is a weak cipher: use AES-GCM instead.',
    ],
    [
      'MD5.Create',
      'A.cs',
      'class K { void M() { var h = MD5.Create(); } }',
      'MD5 is a weak hash: use SHA-256 or stronger instead.',
    ],
    [
      'SHA1Managed',
      'A.cs',
      'class K { void M() { var h = new SHA1Managed(); } }',
      'SHA1 is a weak hash: use SHA-256 or stronger instead.',
    ],
    [
      'HashAlgorithm.Create',
      'A.cs',
      'class K { void M() { var h = HashAlgorithm.Create("MD5"); } }',
      'MD5 is a weak hash: use SHA-256 or stronger instead.',
    ],
    [
      'DES in C#',
      'A.cs',
      'class K { void M() { var c = new DESCryptoServiceProvider(); } }',
      'DES is a weak cipher: use AES-GCM instead.',
    ],
    [
      'CipherMode.ECB',
      'A.cs',
      'class K { void M() { aes.Mode = CipherMode.ECB; } }',
      'ECB mode is a weak cipher mode: use AES-GCM instead.',
    ],
  ])('flags %s', async (_name, file, source, message) => {
    expect(await messagesFor('SC-SEC-005', { [file]: source })).toEqual([message]);
  });

  it.each([
    ['SHA-256', 'a.js', "crypto.createHash('sha256');"],
    ['AES-GCM', 'a.js', "crypto.createCipheriv('aes-256-gcm', key, iv);"],
    ['hashlib.sha256', 'a.py', 'hashlib.sha256(data)'],
    [
      'an MD5 checksum marked as not for security',
      'a.py',
      'hashlib.md5(data, usedforsecurity=False)',
    ],
    ['SHA256.Create', 'A.cs', 'class K { void M() { var h = SHA256.Create(); } }'],
  ])('does not flag %s', async (_name, file, source) => {
    expect(await messagesFor('SC-SEC-005', { [file]: source })).toEqual([]);
  });
});

describe('SC-SEC-006 insecure deserialization (US-030, CWE-502)', () => {
  it.each([
    [
      'pickle.loads',
      'a.py',
      'pickle.loads(data)',
      'pickle.loads() can run code stored in the data it loads.',
    ],
    [
      'pickle.load',
      'a.py',
      'pickle.load(f)',
      'pickle.load() can run code stored in the data it loads.',
    ],
    [
      'marshal.loads',
      'a.py',
      'marshal.loads(data)',
      'marshal.loads() can run code stored in the data it loads.',
    ],
    [
      'yaml.load with no loader',
      'a.py',
      'yaml.load(text)',
      'yaml.load() can run code stored in the data it loads.',
    ],
    [
      'yaml.load with an unsafe loader',
      'a.py',
      'yaml.load(text, Loader=yaml.Loader)',
      'yaml.load() can run code stored in the data it loads.',
    ],
    [
      'jsonpickle',
      'a.py',
      'jsonpickle.decode(text)',
      'jsonpickle.decode() can run code stored in the data it loads.',
    ],
    [
      'BinaryFormatter',
      'A.cs',
      'class K { void M() { var f = new BinaryFormatter(); } }',
      'new BinaryFormatter() can run code stored in the data it loads.',
    ],
    [
      'TypeNameHandling',
      'A.cs',
      'class K { void M() { s.TypeNameHandling = TypeNameHandling.Auto; } }',
      'TypeNameHandling lets the data choose which types are created when it is loaded.',
    ],
    [
      'node-serialize',
      'a.js',
      "const s = require('node-serialize');\ns.unserialize(data);",
      's.unserialize() can run code stored in the data it loads.',
    ],
  ])('flags %s', async (_name, file, source, message) => {
    expect(await messagesFor('SC-SEC-006', { [file]: source })).toEqual([message]);
  });

  it.each([
    ['yaml.safe_load', 'a.py', 'yaml.safe_load(text)'],
    ['yaml.load with SafeLoader', 'a.py', 'yaml.load(text, Loader=yaml.SafeLoader)'],
    ['yaml.load with a positional SafeLoader', 'a.py', 'yaml.load(text, yaml.CSafeLoader)'],
    ['pickle of a constant', 'a.py', 'pickle.loads(b"cposix\\nsystem\\n.")'],
    ['json.loads', 'a.py', 'json.loads(text)'],
    [
      'TypeNameHandling.None',
      'A.cs',
      'class K { void M() { s.TypeNameHandling = TypeNameHandling.None; } }',
    ],
    ['unserialize without node-serialize', 'a.js', 'unserialize(data);'],
  ])('does not flag %s', async (_name, file, source) => {
    expect(await messagesFor('SC-SEC-006', { [file]: source })).toEqual([]);
  });
});

describe('SC-SEC-007 disabled certificate verification (US-030, CWE-295)', () => {
  it.each([
    [
      'rejectUnauthorized: false',
      'a.js',
      'https.request({ rejectUnauthorized: false });',
      'rejectUnauthorized is set to false',
    ],
    ['strictSSL: false', 'a.js', 'request({ strictSSL: false });', 'strictSSL is set to false'],
    [
      'NODE_TLS_REJECT_UNAUTHORIZED',
      'a.js',
      "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';",
      'NODE_TLS_REJECT_UNAUTHORIZED is set to 0',
    ],
    ['verify=False', 'a.py', 'requests.get(url, verify=False)', 'verify is set to False'],
    ['session.verify = False', 'a.py', 'session.verify = False', 'verify is set to False'],
    [
      'check_hostname = False',
      'a.py',
      'context.check_hostname = False',
      'check_hostname is set to False',
    ],
    ['CERT_NONE', 'a.py', 'context.verify_mode = ssl.CERT_NONE', 'verify_mode is set to CERT_NONE'],
    [
      'an unverified context',
      'a.py',
      'ctx = ssl._create_unverified_context()',
      'an unverified SSL context is used',
    ],
    [
      'a callback that accepts everything',
      'A.cs',
      'class K { void M() { ServicePointManager.ServerCertificateValidationCallback += delegate { return true; }; } }',
      'ServerCertificateValidationCallback accepts every certificate',
    ],
    [
      'a lambda that accepts everything',
      'A.cs',
      'class K { void M() { h.ServerCertificateCustomValidationCallback = (a, b, c, d) => true; } }',
      'ServerCertificateCustomValidationCallback accepts every certificate',
    ],
    [
      'the accept-any validator',
      'A.cs',
      'class K { void M() { h.ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator; } }',
      'ServerCertificateCustomValidationCallback accepts every certificate',
    ],
  ])('flags %s', async (_name, file, source, reason) => {
    expect(await messagesFor('SC-SEC-007', { [file]: source })).toEqual([
      `Certificate verification is switched off: ${reason}.`,
    ]);
  });

  it.each([
    ['rejectUnauthorized: true', 'a.js', 'https.request({ rejectUnauthorized: true });'],
    ['verify=True', 'a.py', 'requests.get(url, verify=True)'],
    ['verify with a certificate bundle', 'a.py', 'requests.get(url, verify="/etc/ssl/ca.pem")'],
    ['verify in JavaScript means something else', 'a.js', 'check({ verify: false });'],
    [
      'a callback that checks',
      'A.cs',
      'class K { void M() { h.ServerCertificateCustomValidationCallback = (a, b, c, d) => d == SslPolicyErrors.None; } }',
    ],
  ])('does not flag %s', async (_name, file, source) => {
    expect(await messagesFor('SC-SEC-007', { [file]: source })).toEqual([]);
  });
});

describe('the security rules', () => {
  const security = ALL_RULES.filter((rule) => rule.meta.id.startsWith('SC-SEC-'));

  it('are the seven starter rules, each mapped to a CWE entry with a link (US-030)', () => {
    expect(security.map((rule) => rule.meta.id)).toEqual([
      'SC-SEC-001',
      'SC-SEC-002',
      'SC-SEC-003',
      'SC-SEC-004',
      'SC-SEC-005',
      'SC-SEC-006',
      'SC-SEC-007',
    ]);
    for (const { meta } of security) {
      const cweEntries = meta.standards.filter((s) => s.id?.startsWith('CWE-'));
      expect(cweEntries.length).toBeGreaterThan(0);
      expect(
        cweEntries.every((s) => s.url?.startsWith('https://cwe.mitre.org/data/definitions/')),
      ).toBe(true);
      expect(meta.category).toBe('security');
    }
  });

  it.each(['SC-SEC-002', 'SC-SEC-003', 'SC-SEC-004', 'SC-SEC-005', 'SC-SEC-006', 'SC-SEC-007'])(
    '%s reports at warning by default and skips test code',
    async (id) => {
      const meta = security.find((rule) => rule.meta.id === id)?.meta;

      expect(meta?.defaultSeverity).toBe('warning');
      const messages = await messagesFor(id, {
        'tests/a.test.js':
          "db.query('SELECT * FROM t WHERE id=' + x); eval(x); crypto.createHash('md5'); https.request({ rejectUnauthorized: false });",
        'test_a.py': 'import os, pickle\nos.system("ls " + d)\npickle.loads(data)\n',
      });
      expect(messages).toEqual([]);
    },
  );
});
