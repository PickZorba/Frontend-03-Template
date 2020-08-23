const http = require('http');
const fs = require('fs');

http.createServer((request, response) => {
    let body = [];
    request.on('error', (err) => {
        console.log(err);
    }).on('data', (chunk) => {
        body.push(chunk);
    }).on('end', () => {
        body = Buffer.concat(body).toString();
        console.log('body: ', body);
        response.writeHead(200, {'Content-Type': 'text/html'});
        fs.readFile('./html/baw.html', 'utf8',
            (err, data) => {
                if(err) {throw err};
                response.end(data);
            });
    });
}).listen(8088);

console.log('Server started!');