// Money is decimal.js in code and DECIMAL(18,4) in the database (rule 1, standard §3.9).
// Configured once, here; every module that does money arithmetic requires Decimal from this file.
'use strict';

const Decimal = require('decimal.js');

Decimal.set({ precision: 18, rounding: Decimal.ROUND_HALF_UP });

module.exports = { Decimal };
