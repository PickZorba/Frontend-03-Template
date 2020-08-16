const EOF = Symbol('EOF') // End of file.

function data(c) {
}


module.exports.parseHTML = function parseHTML(html) {
    let state = data;
    for(c of html) {
        state = state(c);
    }
    state = state(EOF);
};