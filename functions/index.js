/**
 * ScriptSearch — Cloud Functions Entry Point
 * Original Frequency Holdings
 *
 * Export all functions here. Firebase reads this file on deploy.
 */

const { search, searchstaging } = require("./search");

exports.search = search;
exports.searchstaging = searchstaging;
