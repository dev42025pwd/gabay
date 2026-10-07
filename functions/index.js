// Cloud Functions entry point (Blueprint Part 1): the whole API is ONE function, `api`, in
// Singapore, held to one instance (L98). The Express app lives in src/app.js.
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { createApp } = require('./src/app');

exports.api = onRequest({ region: 'asia-southeast1', maxInstances: 1 }, createApp());
