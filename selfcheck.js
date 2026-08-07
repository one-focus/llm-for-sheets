/**
 * Runs `llmSelfCheck` outside Apps Script: `node selfcheck.js`.
 *
 * The .gs files are plain scripts, so they load into a VM context with the few
 * Apps Script globals the pure-logic assertions touch. Nothing here reaches the
 * network, a spreadsheet, or a provider — it checks request shapes, response
 * parsers, model filters and formula detection.
 */
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

const source = fs.readFileSync('Code.gs', 'utf8') + '\n' + fs.readFileSync('Providers.gs', 'utf8');

const context = {
  Logger: { log: console.log },
  Utilities: {
    DigestAlgorithm: { MD5: 'md5' },
    Charset: { UTF_8: 'utf8' },
    computeDigest: (algorithm, seed) => Array.from(crypto.createHash('md5').update(seed).digest()),
    base64Encode: bytes => Buffer.from(bytes).toString('base64'),
  },
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty() {} }),
    getUserProperties: () => ({ getProperty: () => null, setProperty() {} }),
  },
};

vm.createContext(context);
vm.runInContext(source + '\nllmSelfCheck();', context);
