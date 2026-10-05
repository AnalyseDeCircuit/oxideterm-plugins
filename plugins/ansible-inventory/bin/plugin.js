#!/usr/bin/env node
// SPDX-License-Identifier: MIT
const path = require('node:path');
require('../generated/runtime.cjs').start(path.resolve(__dirname, '..'), require('../source.cjs'));
