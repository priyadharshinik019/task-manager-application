const { handleRequest } = require('../server');

module.exports = (request, response) => {
  request.url = request.url.replace(/^\/api(?=\/|$)/, '') || '/';
  return handleRequest(request, response);
};
