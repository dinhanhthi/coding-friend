/** Turn a file into `export default "<contents>"` so Turbopack can watch it. */
module.exports = function rawStringLoader(source) {
  return `export default ${JSON.stringify(source)};`;
};
