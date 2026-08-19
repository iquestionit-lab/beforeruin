/**
 * ScriptSearch — Cloud Functions Entry Point
 * Original Frequency Holdings
 *
 * Export all functions here. Firebase reads this file on deploy.
 */

const { search } = require("./search");

exports.search = search;
