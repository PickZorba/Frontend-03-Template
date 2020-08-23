const net = require('net');
const images = require('images');

const parseHTML = require('./parseHTML.js');
const render = require('./render.js');

/*
创建一个 request 类
利用构造函数设置 request 默认值
*/
class Request {
    constructor(options) {
        this.method = options.method || 'GET';
        this.host = options.host;
        this.port = options.port || 80;
        this.path = options.path || '/';
        this.body = options.body || {};
        this.headers = options.headers || {};
        if(!this.headers['Content-Type']) {
            this.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }

        if(this.headers['Content-Type'] === 'application/json') {
            this.bodyText = JSON.stringify(this.body);
        } else if(this.headers['Content-Type'] === 'application/x-www-form-urlencoded') {
            this.bodyText = Object.keys(this.body).map(key => `${key}=${encodeURIComponent(this.body[key])}`).join('&');
        }

        this.headers['Content-Length'] = this.bodyText.length;
    }

    /*
    send 函数返回一个 promise，如果已经创建连接，则直接发送请求
    然后设置两个监听事件，一个监听 data，一个监听 err
    如果接收到了 data，将 data 转换为字符串进行解析，解析完成后返回一个 resolve
    如果接收到了 err，那么就返回一个 reject
    */
    send(connection) {
        return new Promise((resolve, reject) => {
            const parser = new ResponseParser;
            if(connection) {
                connection.write(this.toString());
            } else {
                connection = net.createConnection({
                    host: this.host,
                    port: this.port
                }, () => {
                    connection.write(this.toString());
                })
            }
            connection.on('data', (data) => {
                parser.receive(data.toString());
                if(parser.isFinished) {
                    resolve(parser.response);
                    connection.end();
                }
            });
            connection.on('error', (err) => {
                reject(err);
                connection.end();
            });
        });
    }
    
    /*
    toString 函数将 request 所携带的各项信息，转换成一定格式，并返回
    */
    toString() {
        return `${this.method} ${this.path} HTTP/1.1\r
${Object.keys(this.headers).map(key => `${key}: ${this.headers[key]}`).join('\r\n')}\r
\r
${this.bodyText}`
    }
}

/*
创建一个解析 response 的类，该类使用状态机来对 response 进行解析
利用构造函数设置状态机的各个状态码，及相关信息的初始值
 */
class ResponseParser {
    constructor() {
        this.WAITING_STATUS_LINE = 0;
        this.WAITING_STATUS_LINE_END = 1;
        this.WAITING_HEADER_NAME = 2;
        this.WAITING_HEADER_SPACE = 3;
        this.WAITING_HEADER_VALUE = 4;
        this.WAITING_HEADER_LINE_END = 5;
        this.WAITING_HEADER_BLOCK_END = 6;
        this.WAITING_BODY = 7;

        this.current = this.WAITING_STATUS_LINE;
        this.statusLine = '';
        this.headers = {};
        this.headerName = '',
        this.headerValue = '';
        this.bodyParser = null;
    }

    /*
    isFinished 函数用来判断解析是否结束，并返回 true 或 false
    */
    get isFinished() {
        return this.bodyParser && this.bodyParser.isFinished;
    }

    /*
    response 函数用来返回状态码、状态文本、请求头和body
    */
    get response() {
        this.statusLine.match(/HTTP\/1.1 ([0-9]+) ([\s\S]+)/);
        return {
            statuseCode: RegExp.$1,
            statuseText: RegExp.$2,
            headers: this.headers,
            body: this.bodyParser.content.join('')
        }
    }

    /*
    对接收到的字符串，一个字符一个字符的进行解析
    */
    receive(string){
        for(let i = 0; i < string.length; i++) {
            this.receiveChar(string.charAt(i));
        }
    }

    /*
    对接收到的每一个字符 char 进行解析，根据接收到的 char 来进行状态的切换
    初始状态为等待 WAITING_STATUS_LINE

    当前状态：WAITING_STATUS_LINE
    + 在当前状态，我们所接收到的字符均为 statusLine 的字符，我们需要把接收到的字符拼接起来
    + 当我们接收到 \r 的字符的时候，表示 statusLine 即将结束，状态切换为 WAITING_STATUS_LINE_END

    当前状态：WAITING_STATUS_LINE_END
    + 当我们接收到 \n 的字符的时候，statusLine结束，状态切换为 WAITING_HEADER_NAME

    当前状态：WAITING_HEADER_NAME
    + 如果我们接收到了 \r 字符，表示 headers 即将结束，状态切换为 WAITING_HEADER_BLOCK_END
      (此处我们只考虑 Transfer-Encoding 为 chunked 一种情况)
    + 不然，我们接收到的字符均为 headerName 的字符，我们需要把接收到的字符拼接起来
    + 当我们接收到 : 字符的时候，表示 headerName 接收完毕，状态切换为 WAITING_HEADER_SPACE

    当前状态：WAITING_HEADER_SPACE
    + 当我们接收到空格字符的时候，状态切换为 WAITING_HEADER_VALUE

    当前状态： WAITING_HEADER_VALUE
    + 在当前状态，我们接收到的 char 为 headerValue 的字符，需要将接收到的字符进行拼接
    + 当我们接收到 \r 的字符时，表示 headerValue 接收结束，状态切换为 WAITING_HEADER_LINE_END
      同时，我们将 headerName 和 headerValue 的键值对，存入 headers 中，清空前两个变量的值

    当前状态： WAITING_HEADER_LINE_END
    + 当我们接收到 \n 的字符时，表示 headerLine 结束，状态切换为 WAITING_HEADER_NAME

    当前状态： WAITING_HEADER_BLOCK_END
    + 当我们接收到 \n 的字符时，表示 headers 结束，状态切换为 WAITING_BODY

    当前状态： WAITING_BODY
    + 在当前状态我们需要对接收到的 body 字符进行解析
    */
    receiveChar(char) {
        if(this.current === this.WAITING_STATUS_LINE) {
            if(char === '\r') {
                this.current = this.WAITING_STATUS_LINE_END;
            } else {
                this.statusLine += char;
            }
        } else if(this.current === this.WAITING_STATUS_LINE_END) {
            if(char === '\n') {
                this.current = this.WAITING_HEADER_NAME;
            }
        } else if(this.current === this.WAITING_HEADER_NAME) {
            if(char === ':') {
                this.current  = this.WAITING_HEADER_SPACE;
            } else if(char === '\r') {
                this.current = this.WAITING_HEADER_BLOCK_END;
                if(this.headers['Transfer-Encoding'] === 'chunked') {
                    this.bodyParser = new TrunkedBodyParser();
                }
            } else {
                this.headerName += char;
            }
        } else if(this.current === this.WAITING_HEADER_SPACE) {
            if(char === ' ') {
                this.current = this.WAITING_HEADER_VALUE;
            }
        } else if(this.current === this.WAITING_HEADER_VALUE) {
            if(char === '\r') {
                this.current = this.WAITING_HEADER_LINE_END;
                this.headers[this.headerName] = this.headerValue;
                this.headerName = '';
                this.headerValue = '';
            } else {
                this.headerValue += char;
            }
        } else if(this.current === this.WAITING_HEADER_LINE_END) {
            if(char === '\n') {
                this.current = this.WAITING_HEADER_NAME;
            }
        } else if(this.current === this.WAITING_HEADER_BLOCK_END) {
            if(char === '\n') {
                this.current = this.WAITING_BODY;
            }
        } else if(this.current === this.WAITING_BODY) {
            this.bodyParser.receiveChar(char);
        }
    }
}

/*
创建一个解析 body 的类，该类使用状态机来对 body 进行解析
利用构造函数设置状态机各个状态码，及相关信息的初始值
*/
class TrunkedBodyParser {
    constructor() {
        this.WAITING_LENGTH = 0;
        this.WAITING_LENGTH_LINE_END = 1;
        this.READING_TRUNK = 2;
        this.WAITING_NEW_LINE = 3;
        this.WAITING_NEW_LINE_END = 4;

        this.length = 0;
        this.content = [];
        this.isFinished = false;
        this.current = this.WAITING_LENGTH;
    }

    /*
    对接收的每一个 char 进行解析，根据接收到的 char 来进行状态的切换
    初始状态为 WAITING_LENGTH

    当前状态： WAITING_LENGTH
    + 如果 char 为 \r 且 length 为 0，那么 body 解析结束，isFinished 设置为 true
    + 如果 char 为 \r 且 length 不为 0，状态切换为 WAITING_LENGTH_LINE_END
    + 不然的话，我们将接收到 body 的长度，我们把16进制的长度转换为10进制的长度

    当前状态：WAITING_LENGTH_LINE_END
    + 当接收到 \n 字符，状态切换为 READING_TRUNK

    当前状态： READING_TRUNK
    + 我们将接收到的每一个 char 放入一个数组里，同时 length 依次减1
    + 如果 length 为 0，状态切换为 WAITING_NEW_LINE

    当前状态：WAITING_NEW_LINE
    + 如果接收到 \r 字符，状态切换为 WAITING_NEW_LINE_END

    当前状态：WAITING_NEW_LINE_END
    + 如果接受到 \n 字符，状态切换为 WAITING_LENGTH
    */
    receiveChar(char) {
        if(this.current === this.WAITING_LENGTH) {
            if(char === '\r') {
                if(this.length === 0) {
                    this.isFinished = true;
                }
                this.current = this.WAITING_LENGTH_LINE_END;
            } else {
                this.length *= 16;
                this.length += parseInt(char, 16);
            }
        } else if(this.current === this.WAITING_LENGTH_LINE_END) {
            if(char === '\n') {
                this.current = this.READING_TRUNK;
            }
        } else if(this.current === this.READING_TRUNK) {
            this.content.push(char);
            this.length --;
            if(this.length === 0) {
                this.current = this.WAITING_NEW_LINE;
            }
        } else if(this.current === this.WAITING_NEW_LINE) {
            if(char === '\r') {
                this.current = this.WAITING_NEW_LINE_END;
            }
        } else if(this.current === this.WAITING_NEW_LINE_END) {
            if(char === '\n') {
                this.current = this.WAITING_LENGTH;
            }
        }
    }
}

void async function () {
    let request = new Request({
        method: 'POST',
        host: '127.0.0.1',
        port: '8088',
        path: '/',
        headers: {
            ['X-Foo2']: 'customed'
        },
        body: {
            name: 'Panda'
        }
    });

    let response = await request.send();

    let dom = parseHTML.parseHTML(response.body);
    
    let viewport = images(800, 600);
    
    render(viewport, dom);

    viewport.save("viewport.jpg");
}();