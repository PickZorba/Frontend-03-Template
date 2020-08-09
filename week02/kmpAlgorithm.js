// 计算字符串(cStr)部分匹配表
function partialMatchTable(cStr) {
    let j = 0;
    let T = [0];
    for(let i = 1;i < cStr.length; i++) {
        if(cStr[i] === cStr[j]){
            T.push(j+1);
            j++;
        } else {
            T.push(0);
            j = 0;
        }
    }
    return T;
}

// 判断某个字符串(pStr)中是否包含另外一个字符串(cStr)
// 本方法只找出第一次匹配的情况
function strMatch(pStr, cStr) {
    let p = 0, c = 0;
    let T = partialMatchTable(cStr);
    do {
        if(p >= pStr.length) {
            return `字符串${pStr}中并不包含字符串${cStr}`
        }
        if(pStr[p] === cStr[c]) {
            p++;
            c++;
        } else {
            if(c === 0) {
                p++;
            } else {
                p = c - T[c-1] + p;
                c = 0;
            }
        }
    } while(c < cStr.length)
    return `字符串${pStr}中包含字符串${cStr}，在${pStr}中第一次出现的位置为${p - c}`
}


// 对上面strMatch函数进行变体，便可以获取所有匹配的情况
function strMatchAll(pStr, cStr) {
    let p = 0, c = 0;
    let T = partialMatchTable(cStr);
    let position = [];
    do {
        do {
            if(p >= pStr.length) {
                return position
            }
            if(pStr[p] === cStr[c]) {
                p++;
                c++;
            } else {
                if(c === 0) {
                    p++;
                } else {
                    p = c - T[c-1] + p;
                    c = 0;
                }
            }
        } while(c < cStr.length)
        position.push(p - c);
        c = 0;
    } while (p < pStr.length)
    return position;
}

