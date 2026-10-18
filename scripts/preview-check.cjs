
const http = require('node:http');
function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: 4173, path, timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}
(async () => {
  try {
    const index = await get('/');
    console.log('INDEX status', index.status, 'len', index.body.length);
    console.log('TITLE_OK', index.body.includes('案情板 CaseBoard'));
    const js = index.body.match(/src="([^"]+\.js)"/);
    const css = index.body.match(/href="([^"]+\.css)"/);
    console.log('assets', js && js[1], css && css[1]);
    if (js) {
      const bundle = await get(js[1]);
      console.log('JS status', bundle.status, 'bytes', bundle.body.length);
      console.log('HAS_REACT_FLOW', bundle.body.includes('react-flow'));
      console.log('HAS_TEXT', bundle.body.includes('线型'));
    }
    if (css) {
      const style = await get(css[1]);
      console.log('CSS status', style.status, 'bytes', style.body.length);
      console.log('HAS_ACCENT', style.body.includes('#c0392b') || style.body.includes('192, 57, 43'));
    }
  } catch (e) {
    console.log('ERROR', e.message);
  }
})();
