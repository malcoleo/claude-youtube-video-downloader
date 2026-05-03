/**
 * API Integration Tests for Media Downloader
 * Tests the /api/media/* endpoints
 */

const http = require('http');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5001';

/**
 * Make HTTP request to API
 */
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 5001,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data),
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test suite
const tests = [
  {
    name: 'GET /health returns healthy status',
    async test() {
      const res = await request('GET', '/health');
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.data.status !== 'healthy') throw new Error('Expected healthy status');
      return 'PASS';
    },
  },
  {
    name: 'POST /api/media/info - YouTube URL',
    async test() {
      const res = await request('POST', '/api/media/info', {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
      if (!res.data.success) throw new Error('Expected success=true');
      if (!res.data.title) throw new Error('Expected title in response');
      return 'PASS';
    },
  },
  {
    name: 'POST /api/media/info - Invalid URL returns 400',
    async test() {
      const res = await request('POST', '/api/media/info', { url: 'not-a-url' });
      if (res.status !== 400 && res.status !== 500) throw new Error(`Expected 400 or 500, got ${res.status}`);
      return 'PASS';
    },
  },
  {
    name: 'POST /api/media/info - Missing URL returns 400',
    async test() {
      const res = await request('POST', '/api/media/info', {});
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      return 'PASS';
    },
  },
  {
    name: 'POST /api/media/info/bulk - Multiple URLs',
    async test() {
      const res = await request('POST', '/api/media/info/bulk', {
        urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.data.success) throw new Error('Expected success=true');
      if (!res.data.results) throw new Error('Expected results array');
      return 'PASS';
    },
  },
  {
    name: 'POST /api/media/info/bulk - Empty URLs returns 400',
    async test() {
      const res = await request('POST', '/api/media/info/bulk', { urls: [] });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      return 'PASS';
    },
  },
  {
    name: 'GET /api/media/supported-sites returns list',
    async test() {
      const res = await request('GET', '/api/media/supported-sites');
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.data.sites || !Array.isArray(res.data.sites)) throw new Error('Expected sites array');
      return 'PASS';
    },
  },
  {
    name: 'GET /api/media/status/invalid-job returns 404',
    async test() {
      const res = await request('GET', '/api/media/status/invalid-job-id');
      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
      return 'PASS';
    },
  },
];

// Run tests
async function runTests() {
  console.log(`Running ${tests.length} API tests...\n`);

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      const result = await t.test();
      console.log(`✓ ${t.name}: ${result}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${t.name}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${tests.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
