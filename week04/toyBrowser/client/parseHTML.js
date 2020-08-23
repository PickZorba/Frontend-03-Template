const css = require('css');

const EOF = Symbol('EOF') // End of file.

const layout = require('./layout.js');

let currentToken = null;
let currentAttribute = null;

let stack = [{type: "document", children: []}];
let currentTextNode = null;

let rules = [];

/*
利用 css 包对 style 里的样式进行解析，并推入 rules 中
*/
function addCSSRules(text) {
    let ast = css.parse(text);
    rules.push(...ast.stylesheet.rules);
}

/*
判断选择器是否与元素匹配
*/
function match(element, selector) {
    // 判断是否是文本节点，是则返回 false
    if(!selector || !element.attributes) { return false };
    
    if(selector.charAt(0) === '#') {
        let attr = element.attributes.filter(attr => attr.name === 'id')[0];
        if(attr && attr.value === selector.replace('#', '')) { return true };
    } else if(selector.charAt(0) === '.') {
        let attr = element.attributes.filter(attr => attr.name === 'class')[0];
        if(attr && attr.value === selector.replace('.', '')) { return true };
    } else {
        if(element.tagName === selector) { return true };
    }
    return false;
}

/*
用一个数组 p，确定 css 选择器的优先级
*/
function specificity(selector) {
    let p = [0, 0, 0, 0];
    let selectorParts = selector.split(' ');
    for(let part of selectorParts) {
        if(part.charAt(0) === '#') {
            p[1] += 1;
        } else if(part.charAt(0) === '.') {
            p[2] += 1;
        } else {
            p[3] += 1;
        }
    }
    return p;
}

/*
对两个 css 的优先级进行比较，返回优先级较高的那个
*/
function compare(sp1, sp2) {
    if(sp1[0] - sp2[0]) { return sp1[0] - sp2[0] };
    if(sp1[1] - sp2[1]) { return sp1[1] - sp2[1] };
    if(sp1[2] - sp2[2]) { return sp1[2] - sp2[2] };
    return sp1[3] - sp2[3];
}

/*
从当前元素，向上查到到顶部，如果能和 css 选择器相匹配，那么则向 computedStyle 里添加对应属性值
如果新的 css 选择器优先级更高，则用新的替换旧的
*/
function computeCSS(element) {
    let elements = stack.slice().reverse();
    if(!element.computedStyle) {
        element.computedStyle = {};
    }

    for(let rule of rules) {
        let selectorParts = rule.selectors[0].split(' ').reverse();
        if(!match(element, selectorParts[0])){ continue };

        let matched = false;

        let j = 1;
        for(let i = 0; i < elements.length; i++) {
            if(match(elements[i], selectorParts[j])) {
                j++;
            }
        }
        if(j >= selectorParts.length) { matched = true };

        if(matched) {
            let sp = specificity(rule.selectors[0]);
            let computedStyle = element.computedStyle;
            for(let declaration of rule.declarations) {
                if(!computedStyle[declaration.property]) {
                    computedStyle[declaration.property] = {};
                }
                if(!computedStyle[declaration.property].specificity) {
                    computedStyle[declaration.property].value = declaration.value;
                    computedStyle[declaration.property].specificity = sp;
                } else if(compare(computedStyle[declaration.property].specificity, sp) < 0) {
                    computedStyle[declaration.property].value = declaration.value;
                    computedStyle[declaration.property].specificity = sp;
                }
            }
        }
    }
}

/*
接收并处理三种事件：1、startTag，2、endTag，3、text
*/
function emit(token) {
    let top = stack[stack.length -1];

    /*
    如果 token 是 startTag 类型，获取 token 的 tagName、attribute，存入 element
    计算该 element 的 CSS 属性
    如果不是自封闭元素，则把 element 推入 stack

    如果 token 是 endTag 类型，且当 top 的 tagName 是 style 标签，我们需要 addCSSRules
    栈顶元素进行布局，从栈顶弹出

    如果 token 是 text 类型，我们把 currentTextNode 拼接好后存入 当前元素中
    */
    if(token.type === 'startTag') {
        let element = {
            type: 'element',
            children: [],
            attributes: []
        };

        element.tagName = token.tagName;

        for(let p in token) {
            if(p != 'type' && p != 'tagName') {
                element.attributes.push({
                    name: p,
                    value: token[p]
                });
            }
        }

        computeCSS(element);

        top.children.push(element);

        if(!token.isSelfClosing) {
            stack.push(element);
        }

        currentTextNode = null;

    } else if(token.type === 'endTag') {
        if(top.tagName !== token.tagName) {
            throw new Error("Tag start end doesn't match!");
        } else {
            // 遇到 style 标签时，执行添加CSS规则的操作
            if(top.tagName === 'style') {
                addCSSRules(top.children[0].content);
            }
            layout(top);
            stack.pop();
        }
        currentTextNode = null;

    } else if(token.type === 'text') {
        if(currentTextNode === null) {
            currentTextNode = {
                type: 'text',
                content: ''
            }
            top.children.push(currentTextNode);
        }
        currentTextNode.content += token.content;
    }
}

/*
如果 char 是 < ，那么表示标签开始，返回 tagOpen 函数
不然的话 emit 一个对象，传递 char，返回 data 函数，及自身
*/
function data(c) {
    if(c === '<') {
        return tagOpen;
    } else if(c === EOF) {
        emit({ type: 'EOF'});
    } else {
        emit({
            type: 'text',
            content: c
        })
        return data;
    }
}

/*
如果 char 是 / ，那么表示标签结束，返回 endTagOpen 函数
如果 char 是字母，把 currentToken 设为 startTag，把 char 传入 tagName 函数中
*/
function tagOpen(c) {
    if(c === '/') {
        return endTagOpen;
    } else if(c.match(/^[a-zA-Z]$/)) {
        currentToken = {
            type: 'startTag',
            tagName: ''
        }
        return tagName(c);
    } 
    // else {
    //     return;
    // }
}

/*
如果 char 是 字母，把 currentToken 设为 endTag，把 char 传入 tagName 函数中
*/
function endTagOpen(c) {
    if(c.match(/^[a-zA-Z]$/)) {
        currentToken = {
            type: 'endTag',
            tagName: ''
        }
        return tagName(c);
    } 
    // else if(c === '>') {
    //     // 报错
    //     // throw new Error('EndTagOpen Error!');
    // } else if(c === EOF) {
    //     // 报错
    //     // throw new Error('EndTagOpen get one EOF!');
    // } else {

    // }
}

/*
如果接收到的 char 是字母，那么把 char 拼接至 currentToken.tagName 中，返回 tagName 函数
如果接收到的 char 是 / ，说明是自封闭标签，返回 selfClosingStartTag 函数
如果接收到的 char 是空格，说明后面应该要出现属性名，返回 beforeAttributeName 函数
如果接收到的 char 是 >，则 emit 一个 currentToken ，返回 data 函数
*/
function tagName(c) {
    if(c.match(/^[\t\n\f ]$/)) {
        return beforeAttributeName;
    } else if(c ==='/') {
        return selfClosingStartTag;
    } else if(c.match(/^[a-zA-Z]$/)) {
        currentToken.tagName += c;
        return tagName;
    } else if(c === '>') {
        emit(currentToken);
        return data;
    } 
    // else {
    //     return tagName;
    // }
}

/*
正常情况，初始化 currentAttribute，给 attributeName 函数传入 char 并返回值
如果接收到的 char 是空格，返回 beforeAttributeName 函数
如果 char 为 / 或 >，把 char 传入 afterAttributeName 函数，返回相应值
如果 char 为 =，返回 beforeAttributeName
*/
function beforeAttributeName(c) {
    if(c.match(/^[\t\n\f ]$/)) {
        return beforeAttributeName;
    } else if(c === '/' || c === '>' || c === EOF) {
        return afterAttributeName(c);
    } else if(c === '=') {
        return beforeAttributeValue;
    } else {
        currentAttribute = {
            name: '',
            value: ''
        }
        return attributeName(c);
    }
}

/*
正常情况，把接收到的 char 拼接到 currentAttribute.Name
如果 char 为 = ，返回 beforeAttributeValue 函数
如果 char 为空格等，把 char 传入 afterAttributeName 函数，返回相应的值
*/
function attributeName(c) {
    if(c.match(/^[\t\n\f ]$/) || c === '/' || c === '>' || c === EOF) {
        return afterAttributeName(c);
    } else if(c === '=') {
        return beforeAttributeValue;
    } else {
        currentAttribute.name += c;
        return attributeName;
    }
}

/*
如果 char 为空格，返回 beforeAttributeName 函数
如果 char 为 /，返回 selfClosingStartTag 函数
*/
function afterAttributeName(c) {
    if(c.match(/^[\t\n\f ]$/)) {
        return beforeAttributeName;
    } else if(c === '/') {
        return selfClosingStartTag;
    }
}

/*
如果接收到空格等，返回 beforeAttributeValue 函数
如果 char 为 "，返回 doubleQuotedAttributeValue 函数
如果 char 为 '，返回 singleQuotedAttributeValue 函数
如果 char 为 >，返回 data 函数
如果都不是，则返回 unquotedAttributeValue 函数
*/
function beforeAttributeValue(c) {
    if(c.match(/^[\t\n\f ]$/) || c === '/' || c === '>' || c === EOF) {
        return beforeAttributeValue;
    } else if(c === '"') {
        return doubleQuotedAttributeValue;
    } else if(c === "'") {
        return singleQuotedAttributeValue;
    } else if(c === '>') {
        return data;
    } else {
        return unquotedAttributeValue(c);
    }
}

/*
正常把接收到的 char 拼接到 currentAttribute.value 中，返回自身
如果 char 为 "，把 currentAttribute 的 name 和 value，放入 currentToken 中，返回 afterQuotedAttributeValue
*/
function doubleQuotedAttributeValue(c) {
    if(c === '"') {
        currentToken[currentAttribute.name] = currentAttribute.value;
        return afterQuotedAttributeValue;
    } else {
        currentAttribute.value += c;
        return doubleQuotedAttributeValue;
    }
}

/*
正常把接收到的 char 拼接到 currentAttribute.value 中，返回自身
如果 char 为 "，把 currentAttribute 的 name 和 value，放入 currentToken 中，返回 afterQuotedAttributeValue
*/
function singleQuotedAttributeValue(c) {
    if(c === "'") {
        currentToken[currentAttribute.name] = currentAttribute.value;
        return afterQuotedAttributeValue;
    } else {
        currentAttribute.value += c;
        return singleQuotedAttributeValue;
    }
}

/*
如果 char 为空格，返回 beforeAttributeName 函数
如果 char 为 /，返回 selfClosingStartTag 函数
如果 char 为 >，emit 一个 currentToken，返回 data 函数
*/
function afterQuotedAttributeValue(c) {
    if(c.match(/^[\t\n\f ]$/)) {
        return beforeAttributeName;
    } else if(c === '/') {
        return selfClosingStartTag;
    } else if(c === '>') {
        // currentToken[currentAttribute.name] = currentAttribute.value;
        emit(currentToken);
        return data;
    } 
}

/*
正常把接收到的 char 拼接到 currentAttribute.value 中，返回自身
如果 char 为空格，把 currentAttribute 的 name 和 value，放入 currentToken 中，返回 beforeAttributeName 函数
如果 char 为 /，把 currentAttribute 的 name 和 value，放入 currentToken 中，返回 selfClosingStartTag 函数
如果 char 为 >，把 currentAttribute 的 name 和 value，放入 currentToken 中，emit 一个 currentToken，返回 data 函数
*/
function unquotedAttributeValue(c) {
    if(c.match(/^[\t\n\f ]$/)) {
        currentToken[currentAttribute.name] = currentAttribute.value;
        return beforeAttributeName;
    } else if(c === '/') {
        currentToken[currentAttribute.name] = currentAttribute.value;
        return selfClosingStartTag;
    } else if(c === '>') {
        currentToken[currentAttribute.name] = currentAttribute.value;
        emit(currentToken);
        return data;
    } else {
        currentAttribute.value += c;
        return unquotedAttributeValue;
    }
}

/*
自封闭标签只接收 > ，设置 currentToken.isSelfClosing 为 true
然后 emit 一个 currentToken，返回 data 函数
*/
function selfClosingStartTag(c) {
    if(c === '>') {
        currentToken.isSelfClosing = true;
        emit(currentToken);
        return data;
    }
}

/*
先对 HTML 文本进行解析，然后从 style 标签中提取 css 属性值
*/
module.exports.parseHTML = function parseHTML(html) {
    let state = data;
    for(let c of html) {
        state = state(c);
    }
    state = state(EOF);
    return stack[0];
};