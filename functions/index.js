// Cloud Functions entry point (Blueprint Part 1): the whole API is ONE function, `api`, in
// Singapore, held to one instance (L98). The Express app lives in src/app.js.
//
// Loading this file must be inert: Firebase's deploy-time analysis requires it with no database
// settings present, and a config error at that point would abort the deploy. So nothing here reads
// the config or opens a pool; the app is built on the first request and reused after.
'use strict';

const { onRequest } = require('firebase-functions/v2/https');

let app = null;
const getApp = () => {
  app ??= require('./src/app').createApp();
  return app;
};

exports.api = onRequest({ region: 'asia-southeast1', maxInstances: 1 }, (req, res) =>
  getApp()(req, res),
);
