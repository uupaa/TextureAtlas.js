(function(global) {
"use strict";

// --- dependency modules ----------------------------------
// --- define / local variables ----------------------------
//var _isNodeOrNodeWebKit = !!global.global;
//var _runOnNodeWebKit =  _isNodeOrNodeWebKit &&  /native/.test(setTimeout);
//var _runOnNode       =  _isNodeOrNodeWebKit && !/native/.test(setTimeout);
//var _runOnWorker     = !_isNodeOrNodeWebKit && "WorkerLocation" in global;
//var _runOnBrowser    = !_isNodeOrNodeWebKit && "document" in global;

    var USE_BLOB = 1;
    var TEXTURE_SIZE = 2048; // OpenGLES 2.0 spec, see http://answers.unity3d.com/questions/563094/mobile-max-texture-size.html
    var BLOCK_SIZE = 64;
    var COLS = 32;
    var ROWS = 32;

// --- class / interfaces ----------------------------------
function Atlas() {
    this._maps          = [];  // 32 x 32 grids. [Uint32Array(32), ...]
    this._ctxs          = [];  // sprite sheets(canvas) contexts. [ctx, ...]
    this._spriteSheets  = [];  // sprite sheets(canvas). [HTMLCanvasElement, ...]
    this._imageData     = {};  // image data. { key: { ssn, sw, sh, bx, by, bw, bh }, ... }
                               //       ssn: spriteSheetNumber
                               //       sw:  sourceImageWidth
                               //       sh:  sourceImageHeight
                               //       bx:  block x
                               //       by:  block y
                               //       bw:  block width
                               //       bh:  block height
}

Atlas["VERBOSE"] = false;
Atlas["VERBOSE_VERBOSE"] = false;
Atlas["prototype"]["has"]    = Atlas_has;    // Atlas#has(key:String):Boolean
Atlas["prototype"]["get"]    = Atlas_get;    // Atlas#get(key:String):Object
Atlas["prototype"]["add"]    = Atlas_add;    // Atlas#add(key:String, image:HTMLImageElement|HTMLCanvasElement, sx:UINT16 = 0, sy:UINT16 = 0, sw:UINT16 = image.width, sh:UINT = image.height):void
Atlas["prototype"]["draw"]   = Atlas_draw;   // Atlas#draw(key:String, ctx:CanvasRenderingContext2D, dx:INT16, dy:INT16, dw:UINT16, dh:UINT16):void
Atlas["prototype"]["keys"]   = Atlas_keys;   // Atlas#keys():KeyStringArray
Atlas["prototype"]["tile"]   = Atlas_tile;   // Atlas#tile(width:UINT16, height:UINT16, length:UINT16):TilingDataArray - [ { ssn, i, bx, by, bw, bh }, ... ]
Atlas["prototype"]["remove"] = Atlas_remove; // Atlas#remove(key:String):void
Atlas["prototype"]["clear"]  = Atlas_clear;  // Atlas#clear():void
// --- Utility ---
Atlas["prototype"]["dump"]   = Atlas_dump;   // Atlas#dump(ssn:SpriteSheetNumber = undefined):void
Atlas["imageLoader"]         = Atlas_imageLoader; // Atlas.imageLoader(resource:Array, finished:Function, fail:Function = null, progress:Function = null):void

// --- implements ------------------------------------------
var img = null;
function Atlas_draw(key,  // @arg String
                    ctx,  // @arg CanvasRenderingContext2D
                    dx,   // @arg INT16
                    dy,   // @arg INT16
                    sx,   // @arg Number = 1 - scale x
                    sy) { // @arg Number = 1 - scale y
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(key, "String"),      Atlas_draw, "key");
        $valid($type(ctx, "CanvasRenderingContext2D"), Atlas_draw, "ctx");
        $valid($type(dx,  "INT16"),       Atlas_draw, "dx");
        $valid($type(dy,  "INT16"),       Atlas_draw, "dy");
        $valid($type(sx,  "Number|omit"), Atlas_draw, "sx");
        $valid($type(sy,  "Number|omit"), Atlas_draw, "sy");
    }
//}@dev

    var data = this._imageData[key]; // { ssn, sw, sh, bx, by, bw, bh }
    if (data) {
        if (USE_BLOB) {
            if (!img) {
                img = toBlob(this._spriteSheets[data.ssn], "image/png");
            }
            ctx.drawImage(img,
                        //data.bx * 64, data.by * 64, data.sw, data.sh,
                          data.bx * BLOCK_SIZE, data.by * BLOCK_SIZE, data.sw, data.sh,
                          dx, dy, data.sw * (sx || 1), data.sh * (sy || 1));
        } else {
            ctx.drawImage(this._spriteSheets[data.ssn],
                        //data.bx * 64, data.by * 64, data.sw, data.sh,
                          data.bx * BLOCK_SIZE, data.by * BLOCK_SIZE, data.sw, data.sh,
                          dx, dy, data.sw * (sx || 1), data.sh * (sy || 1));
        }
    }
}

function toBlob(canvas, mimeType) {
    var png = canvas.toDataURL(mimeType);
    var b64 = atob(png.split(",")[1]);
    var u8  = new Uint8Array(b64.length);

    for (var i = 0, iz = b64.length; i < iz; ++i) {
        u8[i] = b64.charCodeAt(i);
    }
    var img = new Image();

    var blob = new Blob([u8.buffer], { "type": mimeType });

    img.src = URL.createObjectURL(blob);
    return img;
}

function Atlas_has(key) { // @arg String
                          // @ret Boolean
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(key, "String"), Atlas_has, "key");
    }
//}@dev

    return !!this._imageData[key];
}

function Atlas_get(key) { // @arg String
                          // @ret { ssn:AtlasNumber, x:UINT16, y:UINT16, w:UINT16, h:UINT16 };
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(key, "String"), Atlas_get, "key");
    }
//}@dev

    var data = this._imageData[key]; // { ssn, sw, sh, bx, by, bw, bh }
    if (data) {
        return {
            "ssn": data.ssn,
          //"x":   data.bx * 64,
            "x":   data.bx * BLOCK_SIZE,
          //"y":   data.by * 64,
            "y":   data.by * BLOCK_SIZE,
            "w":   data.sw,
            "h":   data.sh
        };
    }
    return null;
}

function Atlas_tile(width,    // @arg UINT16 - image width
                    height,   // @arg UINT16 - image height
                    length) { // @arg UINT16 - image length
                              // @ret TilingDataArray - [ { ssn, i, bx, by, bw, bh }, ... ]
    var tile = [];
    var ssn = this._spriteSheets.length - 1; // last ssn
    var bw = _block(width);
    var bh = _block(height);
    var i = 0;
    var bx = -bw;
    var by = 0;

    // do tiling to maximum width and maximum height.
    for (; i < length; ++i) {
        bx += bw;
      //if (bx + bw > 32) {
        if (bx + bw > COLS) {
            by += bh;
          //if (by + bh > 32) {
            if (by + bh > ROWS) {
                ++ssn;
                by = 0;
            }
            bx = 0;
        }
        tile.push({ "ssn": ssn, "i": i, "bx": bx, "by": by, "bw": bw, "bh": bh });
    }
    return tile;
}

function Atlas_add(key,    // @arg String
                   image,  // @arg HTMLImageElement|HTMLCanvasElement
                   sx,     // @arg UINT16 = 0 - source x
                   sy,     // @arg UINT16 = 0 - source y
                   sw,     // @arg UINT16 = image.width  - source w
                   sh) {   // @arg UINT16 = image.height - source h
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(key,   "String"),      Atlas_add, "key");
        $valid($type(image, "HTMLImageElement|HTMLCanvasElement"), Atlas_add, "image");
        $valid($type(sx,    "UINT16|omit"), Atlas_add, "sx");
        $valid($type(sy,    "UINT16|omit"), Atlas_add, "sy");
        $valid($type(sw,    "UINT16|omit"), Atlas_add, "sw");
        $valid($type(sh,    "UINT16|omit"), Atlas_add, "sh");
    }
//}@dev

    if (key in this._imageData) { // already exists.
        return;
    }

    sx = sx || 0;
    sy = sy || 0;
    sw = sw || (image instanceof HTMLImageElement  ? image.naturalWidth :
                image instanceof HTMLCanvasElement ? image.width : 0);
    sh = sh || (image instanceof HTMLImageElement  ? image.naturalHeight :
                image instanceof HTMLCanvasElement ? image.height : 0);

    // 画像を格納するために必要なブロックサイズを求める
    var bw  = _block(sw); // required block width
    var bh  = _block(sh); // required block height

    // 空き地を検索
    var pos = _findFreeSpace(this, bw, bh); // { ssn, bx, by }
    if (!pos) {
        // 空いてるスペースが無ければ、スプライトシートを追加し左上(bx:0,by:0)に配置
        pos = { ssn: _addSpriteSheet(this), bx: 0, by: 0 };
    }
    var ssn = pos.ssn;
    var bx  = pos.bx;
    var by  = pos.by;

    // 画像データを保存
    this._imageData[key] = { ssn: ssn, sw: sw, sh: sh,
                                       bx: bx, by: by, bw: bw, bh: bh };
    // 空き地を専有
    _mapping(this._maps[ssn], bx, by, bw, bh);

  //this._ctxs[ssn].drawImage(image, sx, sy, sw, sh, bx * 64, by * 64, sw, sh);
    // スプライトシートに画像をストック
    this._ctxs[ssn].drawImage(image, sx, sy, sw, sh, bx * BLOCK_SIZE, by * BLOCK_SIZE, sw, sh);
}

function _block(size) {
    switch (BLOCK_SIZE) {
    case 64: return ((size % 64 === 0) ? size : (((size >>> 6) + 1) << 6)) >>> 6;
    case 32: return ((size % 32 === 0) ? size : (((size >>> 5) + 1) << 5)) >>> 5;
    case 16: return ((size % 16 === 0) ? size : (((size >>> 4) + 1) << 4)) >>> 4;
    case  8: return ((size %  8 === 0) ? size : (((size >>> 3) + 1) << 3)) >>> 3;
    case  4: return ((size %  4 === 0) ? size : (((size >>> 2) + 1) << 2)) >>> 2;
    }
}

// 空き地検索アルゴリズム(ver 0.2)
//
// ssn: スプライトシート番号
// bx: 現在検索中のブロックのx座標。値の範囲は0〜31
// by: 現在検索中のブロックのy座標。値の範囲は0〜31
// bw: 引数で与えられた空き地の幅
// bh: 引数で与えられた空き地の高さ
// map[by]: スキャン中の行, UINT32の数値(0が未使用,1が使用済みを意味するビット列)が格納されている
// popcount: UINT32の値からビットが1になっている数をカウントする
//            popcountを求めることで、空き地のブロック数を取得できるが、
//            それが連続した空き地かどうかはpopcountだけでは分からない
//
// [1] スプライトシートの縦方向にスキャンを開始する
// [2] 0〜31行を順にスキャンする。by+bhが32以上ならもう可能性がないためループを終了する
// [3] スキャン中の行(map[by])のpopcountを求める
// [4] popcount + bw が 32以上なら可能性がないため次の行に移動する
// [5] その行に空き地が存在する可能性があるなら、横方向のスキャンを開始する
// [6] 横方向のスキャンは0〜31カラムの順にスキャンする。bx+bwが32以上ならもう可能性がないためループを終了する
// [7] bw と bx から 0000111100...000 のようなビット列を作成する。bwの数だけ1のビット連続し、bxの数だけ先頭に0が並ぶ
//     bw=2,bx=3なら 00011000...000 となる
// [8] 現在の行とビット列のxorを取る。既に埋まっているところにビット列を重ねると(1 xor 1) でそのビットは0になる
// [9] 現在の行とビット列のorを取る。既に埋まっているところにビット列を重ねると(1 or 1) でそのビットは1になる
// [10] xor と or の結果を比較し同じ場合はその行のbxの場所にbw分の連続した空き地が存在する。
// [11] 一行分の空き地があることか分かったら、縦方向に同様にxorとorを使ったスキャンを行う
// [12] by 〜 bh, bx 〜 bw の空き地を確認したら検索終了。return { ssn, bx, by } を返す
// [13] 見つからない場合は null を返す
//
function _findFreeSpace(that,
                        bw,   // @arg UINT8 - block width, from 1 to 32
                        bh) { // @arg UINT8 - block height, from 1 to 32
                              // @ret Object - { ssn, bx, by }
    var maps = that._maps;

    for (var ssn = 0, sz = that._spriteSheets.length; ssn < sz; ++ssn) {
        var map = maps[ssn];

      //for (var by = 0; by < 32 && by + bh <= 32; ++by) { // [1][2]
        for (var by = 0; by < ROWS && by + bh <= ROWS; ++by) { // [1][2]
            var line = map[by]; // UINT32
            var pops = _getPopulationCount(line); // [3]

          //if (pops + bw <= 32) { // [4]
            if (pops + bw <= COLS) { // [4]
              //for (var bx = 0; bx < 32 && bx + bw <= 32; ++bx) { // [5][6]
                for (var bx = 0; bx < COLS && bx + bw <= COLS; ++bx) { // [5][6]
                    // https://gist.github.com/uupaa/6a9094089783e02c2218
                  //var bits = (0xFFFFFFFF << (32 - bw)) >>> bx; // [7]
                    var bits = (0xFFFFFFFF << (COLS - bw)) >>> bx; // [7]
                    var a = (line ^ bits) >>> 0; // [8]
                    var b = (line | bits) >>> 0; // [9]

                    if (a === b) { // [10] found the pit in this line.
                        var ok = true;
                        // --- find below lines ---
                        for (var y = by + 1, yz = y + bh; y < yz && ok; ++y) { // [11]
                            a = (map[y] ^ bits) >>> 0;
                            b = (map[y] | bits) >>> 0;
                            ok = a === b;
                        }
                        if (ok) { // [12]
                            return { ssn: ssn, bx: bx, by: by };
                        }
                    }
                }
            }
        }
    }
    return null; // [13] not found
}
function _addSpriteSheet(that) { // @ret UINT8 - new sprite sheet number.
    var canvas = document.createElement("canvas");
  //canvas.width  = 2048;
    canvas.width  = TEXTURE_SIZE;
  //canvas.height = 2048;
    canvas.height = TEXTURE_SIZE;

    var ssn = that._spriteSheets.push(canvas) - 1; // sprite sheet number.

    that._ctxs[ssn] = canvas.getContext("2d");
  //that._maps[ssn] = new Uint32Array(32); // 32 lines
    that._maps[ssn] = new Uint32Array(ROWS); // 32 lines

    if (Atlas["VERBOSE"] && global["document"]) {
        //canvas.style.cssText = "background: lime; border: 1px solid red";
        canvas.style.cssText = "background-color:lime";
        document.body.appendChild(canvas);

        if (Atlas["VERBOSE_VERBOSE"]) {
            // --- draw grid pattern ---
            that._ctxs[ssn].beginPath();
          //for (var grid = 0; grid < 2048; grid += 64) {
            for (var grid = 0; grid < TEXTURE_SIZE; grid += BLOCK_SIZE) {
                that._ctxs[ssn].moveTo(grid, 0);
              //that._ctxs[ssn].lineTo(grid, 2047);
                that._ctxs[ssn].lineTo(grid, TEXTURE_SIZE - 1);
                that._ctxs[ssn].moveTo(0, grid);
              //that._ctxs[ssn].lineTo(2047, grid);
                that._ctxs[ssn].lineTo(TEXTURE_SIZE - 1, grid);
            }
            that._ctxs[ssn].stroke();
            that._ctxs[ssn].closePath();
        }
    }
    return ssn; // new sprite sheet number
}
function _mapping(map, bx, by, bw, bh) {
  //var bits = (0xFFFFFFFF << (32 - bw)) >>> bx;
    var bits = (0xFFFFFFFF << (COLS - bw)) >>> bx;

    for (var byz = by + bh; by < byz; ++by) {
        map[by] |= bits;
    }
}
function _unmapping(map, bx, by, bw, bh) {
  //var bits = ~(0xFFFFFFFF << (32 - bw)) >>> bx;
    var bits = ~(0xFFFFFFFF << (COLS - bw)) >>> bx;

    for (var byz = by + bh; by < byz; ++by) {
        map[by] &= bits;
    }
}
function _getPopulationCount(bits) { // @arg UINT32 - value
                                     // @ret UINT8 - from 0 to 32
                                     // @desc SSE4.2 POPCNT function
                                     // @see http://www.nminoru.jp/~nminoru/programming/bitcount.html
    bits = (bits & 0x55555555) + (bits >>  1 & 0x55555555);
    bits = (bits & 0x33333333) + (bits >>  2 & 0x33333333);
    bits = (bits & 0x0f0f0f0f) + (bits >>  4 & 0x0f0f0f0f);
    bits = (bits & 0x00ff00ff) + (bits >>  8 & 0x00ff00ff);
    return (bits & 0x0000ffff) + (bits >> 16 & 0x0000ffff);
}


function Atlas_keys() { // @ret KeyStringArray - [key, ...]
    return Object.keys(this._imageData);
}

function Atlas_remove(key) { // @arg String
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(key, "String"), Atlas_remove, "key");
    }
//}@dev

    var data = this._imageData[key]; // { ssn, sw, sh, bx, by, bw, bh }
    if (data) {
        var ssn = data.ssn;

        _unmapping(this._maps[ssn], data.bx, data.by, data.bw, data.bh);
      //this._ctxs[ssn].clearRect(data.bx * 64, data.by * 64, data.sw, data.sh);
        this._ctxs[ssn].clearRect(data.bx * BLOCK_SIZE, data.by * BLOCK_SIZE, data.sw, data.sh);
      //this._imageData[key] = null; // As you know this code is quick, but becomes a little complex.
        delete this._imageData[key];
    }
}

function Atlas_clear() {
    this._maps = [];
    this._ctxs = [];
    this._spriteSheets = [];
    this._imageData = {};
}

// === Utility =============================================
function Atlas_dump(ssn) { // @arg SpriteSheetNumber = undefined
    if (ssn === undefined) { // dump all
        this._maps.forEach(function(map, ssn) {
            console.log("SpriteSheet No: " + ssn);
            _dump(map);
        });
    } else {
        _dump(this._maps[ssn]);
    }

    function _dump(map) {
      //for (var y = 0; y < 32; ++y) {
        for (var y = 0; y < ROWS; ++y) {
            console.log( (y < 10 ? ("0" + y) : y) + ":", _bin(map[y]) );
        }
    }
}

function _bin(num) {
    var binary32 = "00000000000000000000000000000000";
    var bin = (binary32 + num.toString(2)).slice(-32);

    return bin.replace(/(\d)(?=(\d\d\d\d)+(?!\d))/g, "$1,");
}

function Atlas_imageLoader(resources,  // @arg Array - HTMLImageElement or URLString or BlobURLString. [img, url, bloburl, ...]
                           finished,   // @arg Function - callback(images:HTMLImageElementArray):void
                           fail,       // @arg Function = null - fail(error:Error):void
                           progress) { // @arg Function = null - progress(image:HTMLImageElement, index:UINT16):void
    var NOP = function() {};
    var result = {
            images: [],
            loadedCount: 0
        };

    _imageLoader(result, resources, 0, resources.length, finished, fail || NOP, progress || NOP);
}

function _imageLoader(result, resources, i, iz, finished, fail, progress) {
    if (result.loadedCount >= iz) {
        finished(result.images);
    } else {
        var res = resources[i];

        if (res instanceof HTMLImageElement) {
            result.images[i] = res;
            result.loadedCount++;
            progress(res, i);
            _imageLoader(result, resources, i + 1, iz, finished, fail, progress);
        } else if (typeof res === "string") {
            var img = document.createElement("img");

            img.onload = function() {
                result.images[i] = img;
                result.loadedCount++;
                progress(img, i);
                _imageLoader(result, resources, i + 1, iz, finished, fail, progress);
            };
            img.onerror = function() {
                fail(new Error("IMAGE LOAD ERROR: " + res));
            };
            img.src = res;
        }
    }
}

// --- validate / assertions -------------------------------
//{@dev
function $valid(val, fn, hint) { if (global["Valid"]) { global["Valid"](val, fn, hint); } }
function $type(obj, type) { return global["Valid"] ? global["Valid"].type(obj, type) : true; }
//function $keys(obj, str) { return global["Valid"] ? global["Valid"].keys(obj, str) : true; }
//function $some(val, str, ignore) { return global["Valid"] ? global["Valid"].some(val, str, ignore) : true; }
//function $args(fn, args) { if (global["Valid"]) { global["Valid"].args(fn, args); } }
//}@dev

// --- exports ---------------------------------------------
if (typeof module !== "undefined") {
    module["exports"] = Atlas;
}
global["Atlas" in global ? "Atlas_" : "Atlas"] = Atlas;

})((this || 0).self || global); // WebModule idiom. http://git.io/WebModule


