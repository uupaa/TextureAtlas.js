(function moduleExporter(name, closure) {
"use strict";

var entity = GLOBAL["WebModule"]["exports"](name, closure);

if (typeof module !== "undefined") {
    module["exports"] = entity;
}
return entity;

})("TextureAtlas", function moduleClosure(global) {
"use strict";

// --- dependency modules ----------------------------------
var URI = global["WebModule"]["URI"];

// --- define / local variables ----------------------------
// --- class / interfaces ----------------------------------
function TextureAtlas(options) { // @arg Object = { useCache }
                                 // @options.useCache Boolean = false
//{@dev
    $valid($type(options, "Object|omit"), TextureAtlas, "options");
    if (options) {
        $valid($keys(options, "useCache"), TextureAtlas, "options");
        $valid($type(options.useCache, "Boolean"), TextureAtlas, "options.useCache");
    }
//}@dev

    options = options || {};

    this._async         = true;
    this._useCache      = options["useCache"] || false;
    this._blockSizes    = {};  // block sizes. { ssn: bs, ... }
    this._groups        = { "": [] }; // group names. { group: [ssn, ...] }
    this._maps          = [];  // logical grid data(32 x 32 grids). [Uint32Array(32), ...]
    this._ctxs          = [];  // canvas contexts. [ctx, ...]
    this._spriteSheets  = [];  // canvas. [HTMLCanvasElement, ...]
    this._imageData     = {};  // image data. { id: { ssn, bs, sw, sh, bx, by, bw, bh }, ... }
                               //       ssn: sprite sheet number
                               //       bs:  block size
                               //       sw:  source image width
                               //       sh:  source image height
                               //       bx:  block x in sprite sheet
                               //       by:  block y in sprite sheet
                               //       bw:  block width in sprite sheet
                               //       bh:  block height in sprite sheet
    this._imageCache    = {};  // image cache make from blob. { ssn: Image, ... }
    this._cacheState    = {};  // cache state. { ssn: state, ... }. state = CACHED or WAIT or DIRTY
    this._dirty         = false;
}

// --- internal parameter ---
TextureAtlas.COLS = 32; // 横方向の分割数
TextureAtlas.ROWS = 32; // 縦方向の分割数
TextureAtlas.MIN_BLOCK_SIZE = 8;
TextureAtlas.MAX_BLOCK_SIZE = 32; // performance issue: 64(=2048px) is prohibited, because creation of the cache is too heavy.
// --- verbose mode ---
TextureAtlas["VERBOSE"] = false;
TextureAtlas["VERBOSE_VERBOSE"] = false;
// --- cache state ---
TextureAtlas.CACHED = 0; // cached
TextureAtlas.WAIT   = 1; // creating a cache
TextureAtlas.DIRTY  = 2; // cache is dirty

TextureAtlas["RULE_FIND_FIRST"] = 0;
// find first ( 最初に見つかった場所に設置する )
// ブロックサイズを考慮せず、
// スプライトシートリストの先頭から空き地を検索し、見つかった場所に追加を試みる。
// どこにも追加できなければ、
// 見つからない場合は、画像を追加可能な(適切なブロックサイズを持った)新しいスプライトシートを追加し、
// 左上に画像を追加する

TextureAtlas["RULE_COMPACT"] = 1;
// compact ( あまり面積をコンパクトにする )
// スプライトシートリストを画像を格納するために最適なブロックサイズでフィルタリングし、
// フィルタリングに残ったスプライトシートリストのの先頭から空き地を検索し、
// 見つかった場所に追加を試みる。
// 見つからない場合は、RULE_FIND_FIRST が指定された場合と同様に振る舞う。

TextureAtlas["RULE_ALIGN"] = 2;
// size align ( つぶを揃える )
// スプライトシートリストを画像を格納するために最適なブロックサイズでフィルタリングし、
// フィルタリングに残ったスプライトシートリストのの先頭から空き地を検索し、
// 見つかった場所に追加を試みる。
// 見つからない場合は、画像を追加可能な(適切なブロックサイズを持った)新しいスプライトシートを追加し、
// 左上に画像を追加する

TextureAtlas["repository"] = "https://github.com/uupaa/TextureAtlas.js/"; // GitHub repository URL.
TextureAtlas["prototype"] = Object.create(TextureAtlas, {
    "constructor":  { "value": TextureAtlas             },  // new TextureAtlas(options:Object = {}):TextureAtlas
    "has":          { "value": TextureAtlas_has         },  // TextureAtlas#has(id:IDString):Boolean
    "get":          { "value": TextureAtlas_get         },  // TextureAtlas#get(id:IDString):Object|null
    "add":          { "value": TextureAtlas_add         },  // TextureAtlas#add(source:HTMLImageElement|HTMLCanvasElement, id:IDString, rect:ArrayLike|RectObject = null, group:String = "", rule:Integer = TextureAtlas.RULE_FIND_FIRST):void
    "draw":         { "value": TextureAtlas_draw        },  // TextureAtlas#draw(id:IDString, ctx:CanvasRenderingContext2D, dx:INT16, dy:INT16, scaleX:Number = 1, scaleY:Number = 1):void
    "keys":         { "value": TextureAtlas_keys        },  // TextureAtlas#keys():IDStringArray
//  "tile":         { "value": TextureAtlas_tile        },  // TextureAtlas#tile(width:UINT16, height:UINT16, length:UINT16):TilingDataArray - [ { ssn, i, bx, by, bw, bh }, ... ]
    "remove":       { "value": TextureAtlas_remove      },  // TextureAtlas#remove(ids:IDString|IDStringArray):void
    "clear":        { "value": TextureAtlas_clear       },  // TextureAtlas#clear():void
    "dump":         { "value": TextureAtlas_dump        },  // TextureAtlas#dump(ssn:SpriteSheetNumber = undefined):void
    "updateCache":  { "value": TextureAtlas_updateCache },  // TextureAtlas#updateCache():void
    "dirty":        { "get":   function() { return this._dirty; } },  // TextureAtlas#dirty():Boolean
});
TextureAtlas["imageLoader"] = TextureAtlas_imageLoader; // TextureAtlas.imageLoader(resource:Array, callback:Function, errorback:Function = null, onprogress:Function = null):void

// --- implements ------------------------------------------
function TextureAtlas_draw(id,       // @arg IDString
                           ctx,      // @arg CanvasRenderingContext2D
                           dx,       // @arg INT16 - destination x in ctx
                           dy,       // @arg INT16 - destination y in ctx
                           scaleX,   // @arg Number = 1 - scale x
                           scaleY) { // @arg Number = 1 - scale y
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(id,     "IDString"),    TextureAtlas_draw, "id");
        $valid($type(ctx,    "CanvasRenderingContext2D"), TextureAtlas_draw, "ctx");
        $valid($type(dx,     "INT16"),       TextureAtlas_draw, "dx");
        $valid($type(dy,     "INT16"),       TextureAtlas_draw, "dy");
        $valid($type(scaleX, "Number|omit"), TextureAtlas_draw, "scaleX");
        $valid($type(scaleY, "Number|omit"), TextureAtlas_draw, "scaleY");
    }
//}@dev

    var data = this._imageData[id]; // { ssn, bs, sw, sh, bx, by, bw, bh }

    if (data) {
        var bs    = data.bs;  // block size
        var ssn   = data.ssn; // sprite sheet number
        var cache = this._useCache && this._cacheState[ssn] === TextureAtlas.CACHED;
        var res   = cache ? this._imageCache[ssn]
                          : this._spriteSheets[ssn];
        ctx.drawImage(res,
                      data.bx * bs,
                      data.by * bs,
                      data.sw,
                      data.sh,
                      dx,
                      dy,
                      data.sw * (scaleX || 1),
                      data.sh * (scaleY || 1));
    }
}

function TextureAtlas_updateCache() {
    if (this._useCache && this._dirty) {
        var obj = _enumDirty(this);
        var ssna = [].concat( obj[8], obj[16], obj[32], obj[64] );

        _next(this);
    }

    function _next(that) { // @recursive
        var ssn = ssna.shift();

        if (ssn !== undefined) {
            _updateCache(that, ssn, that._async, function() {
                _next(that);
            });
        }
    }

    function _enumDirty(that) { // @ret Object - { 8: [ssn, ...], 16: [ssn, ...], 32: [ssn, ...], 64: [ssn, ...] }
        var result = { 8: [], 16: [], 32: [], 64: [] };
        for (var ssn in that._cacheState) { // { ssn: state, ... }
            if (that._cacheState[ssn] === TextureAtlas.DIRTY) {
                var bs = that._blockSizes[ssn]; // 8, 16, 32, 64
                result[bs].push(ssn >>> 0);
            }
        }
        return result;
    }
}

function _hasDirty(that) {
    return /\:1|\:2/.test(JSON.stringify(that._cacheState));
}

function _updateCache(that,   // @arg this
                      ssn,    // @arg UINT8 - sprite sheet number
                      async,  // @arg Boolean - specify how to create a cache, sync or async.
                      done) { // @arg Function - done():void
    that._cacheState[ssn] = TextureAtlas.WAIT; // DIRTY -> WAIT
    if (ssn in that._imageCache) {
        URL.revokeObjectURL( that._imageCache[ssn].url ); // revoke old cache
    }

    if (TextureAtlas["VERBOSE"]) { var a = $now(); }

    _toBlob(that._spriteSheets[ssn], "image/png", function(blob) {
        var img = new Image();
        img.src = URL.createObjectURL(blob);
        that._imageCache[ssn] = img;
        that._cacheState[ssn] = TextureAtlas.CACHED; // WAIT -> CACHED
        that._dirty = _hasDirty(that); // update dirty state

        if (TextureAtlas["VERBOSE"]) {
            console.log("updateCache: {ssn:" + ssn + ",blockSize:" + that._blockSizes[ssn] + "}: " + ($now() - a) + "ms" );
        }
        done();
    });

    function _toBlob(canvas, mimeType, callback) {
        if (async) {
            if (canvas.toBlob) {
                canvas.toBlob(callback, mimeType);
            } else {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", canvas.toDataURL(mimeType) );
                xhr.responseType = "arraybuffer";
                xhr.onload = function() {
                    callback( new Blob( [xhr.response], { "type": mimeType } ) );
                };
                xhr.send();
            }
        } else {
            var str = canvas.toDataURL(mimeType).split(",")[1]; // pc:91ms, mb:802ms
            var bin = atob(str);                                // pc: 2ms, mb: 17ms
            var u8  = new Uint8Array(bin.length);
            for (var i = 0, iz = bin.length; i < iz; ++i) {     // pc:18ms, mb: 16ms
                u8[i] = bin.charCodeAt(i);
            }
            callback( new Blob([u8], { "type": mimeType }) );   // pc:0.3ms, mb: 4ms
        }
    }
}

function _removeCache(that, ssna) {
    for (var i = 0, iz = ssna.length; i < iz; ++i) {
        URL.revokeObjectURL( that._imageCache[ ssna[i] ].url );
    }
}

function TextureAtlas_has(id) { // @arg IDString
                                // @ret Boolean
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(id, "String"), TextureAtlas_has, "id");
    }
//}@dev

    return !!this._imageData[id];
}

function TextureAtlas_get(id) { // @arg IDString
                                // @ret Object|null - { ssn:UINT8, x:UINT16, y:UINT16, w:UINT16, h:UINT16 };
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(id, "String"), TextureAtlas_get, "id");
    }
//}@dev

    var data = this._imageData[id]; // { ssn, bs, sw, sh, bx, by, bw, bh }
    if (data) {
        return {
            "ssn": data.ssn,
            "x":   data.bx * data.bs,
            "y":   data.by * data.bs,
            "w":   data.sw,
            "h":   data.sh
        };
    }
    return null;
}

/* TODO:
function TextureAtlas_tile(width,    // @arg UINT16 - image width
                           height,   // @arg UINT16 - image height
                           length) { // @arg UINT16 - image length
                                     // @ret TilingDataArray - [ { ssn, bs, i, bx, by, bw, bh }, ... ]
    var tile = [];
    var ssn = this._spriteSheets.length - 1; // last ssn
    var bw = _block(width, this._blockSize); // TODO
    var bh = _block(height, this._blockSize); // TODO
    var bx = -bw;
    var by = 0;

    // do tiling to maximum width and maximum height.
    for (var i = 0; i < length; ++i) {
        bx += bw;
        if (bx + bw > TextureAtlas.COLS) {
            by += bh;
            if (by + bh > TextureAtlas.ROWS) {
                ++ssn;
                by = 0;
            }
            bx = 0;
        }
        tile.push({ "ssn": ssn, "bs": bs, "i": i, "bx": bx, "by": by, "bw": bw, "bh": bh });
    }
    return tile;
}
 */

function TextureAtlas_add(source, // @arg HTMLImageElement|HTMLCanvasElement
                          id,     // @arg IDString
                          rect,   // @arg Array|RectObject = null - clip rect. [x, y, w, h] or { x, y, w, h }
                                  // @rect.x UINT16 = 0
                                  // @rect.y UINT16 = 0
                                  // @rect.w UINT16 = source.width
                                  // @rect.h UINT16 = source.height
                          group,  // @arg String = "" - group name.
                          rule) { // @arg Integer = RULE_FIND_FIRST - RULE_FIND_FIRST or RULE_COMPACT or RULE_ALIGN
                                  // @throw TypeError("{{id}} too large")
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(source, "HTMLImageElement|HTMLCanvasElement"), TextureAtlas_add, "source");
        $valid($type(id,     "String"),                             TextureAtlas_add, "id");
        $valid($type(rect,   "Array|RectObject|omit"),              TextureAtlas_add, "rect");
        $valid($type(group,  "String|omit"),                        TextureAtlas_add, "group");
        $valid($type(rule,   "Integer|omit"),                       TextureAtlas_add, "rule");
    }
//}@dev

    if (id in this._imageData) { // already exists
        return;
    }

    rect  = rect  || [0, 0, 0, 0];
    group = group || "";
    rule  = rule  || TextureAtlas["RULE_FIND_FIRST"];

    if ( !(group in this._groups) ) {
        this._groups[group] = []; // add new group
    }
    var isimg = source instanceof HTMLImageElement;
    var sx = (rect[0] || rect["x"] || 0) | 0;
    var sy = (rect[1] || rect["y"] || 0) | 0;
    var sw = (rect[2] || rect["w"] || (isimg ? source.naturalWidth  : source.width))  | 0;
    var sh = (rect[3] || rect["h"] || (isimg ? source.naturalHeight : source.height)) | 0;

    var longEdge = Math.max(sw, sh);
    if (longEdge > TextureAtlas.MAX_BLOCK_SIZE * 32) { // size over?
        throw new TypeError(id + " too large");
    }
    var bs = _getFitBlockSize(longEdge); // block size
    var candidates = []; // [ssn, ...]

    switch (rule) {
    case TextureAtlas["RULE_FIND_FIRST"]:
        candidates = _filterSpriteSheetNumberByBlockSize(this, group, 0); // ignore blocksize(match all)
        break;
    case TextureAtlas["RULE_COMPACT"]:
        candidates = _filterSpriteSheetNumberByBlockSize(this, group, bs);
        if (!candidates.length) {
            candidates = _filterSpriteSheetNumberByBlockSize(this, group, 0); // ignore blocksize(match all)
        }
        break;
    case TextureAtlas["RULE_ALIGN"]:
        candidates = _filterSpriteSheetNumberByBlockSize(this, group, bs);
    }

    // 画像を格納するために必要な論理ブロックサイズを求める
    var ssn = 0; // sprite sheet number
    var bx  = 0; // block x (0 is left)
    var by  = 0; // block y (0 is top)
    var bw  = _getBlockSize(sw, bs); // block size に基づいた block width  を求める
    var bh  = _getBlockSize(sh, bs); // block size に基づいた block height を求める

    var freeSpace = null;

    if (candidates.length) {
        // 画像を inject できるだけの空き地(FreeSpace)を検索
        freeSpace = _findFreeSpace(this, candidates, sw, sh); // { ssn:UINT8, bs: UINT8, bx:UINT16, by:UINT16, bw:UINT8, bh:UINT8 } or null
    }
    if (freeSpace) {
        ssn = freeSpace.ssn;
        bx  = freeSpace.bx;
        by  = freeSpace.by;
        bw  = freeSpace.bw;
        bh  = freeSpace.bh;
        bs  = freeSpace.bs;
    } else {
        // 空き地が無ければ、新しいスプライトシートを追加し、画像を左上(bx:0,by:0)に配置する
        ssn = _addSpriteSheet(this, bs);
        this._blockSizes[ssn] = bs;
        this._groups[group].push(ssn);
    }

    // 画像の情報と画像の保存先(スプライトシート)の情報を記録
    this._imageData[id] = {
        ssn: ssn, // sprite sheet number
        bs:  bs,  // block size
        sw:  sw,  // source width
        sh:  sh,  // source height
        bx:  bx,  // block x
        by:  by,  // block y
        bw:  bw,  // block width
        bh:  bh   // block height
    };

    // 論理配置: 空き地に画像を配置
    _logicalMapping(this._maps[ssn], bx, by, bw, bh);

    // 物理配置: スプライトシート(canvas)に画像を配置
    this._ctxs[ssn].drawImage(source, sx, sy, sw, sh, bx * bs, by * bs, sw, sh);

    // キャッシュの状態を設定
    if (this._useCache) {
        this._cacheState[ssn] = TextureAtlas.DIRTY;
        this._dirty = true;
    }
}

// 同じグループに所属している ssn を blockSize でフィルタリングする
function _filterSpriteSheetNumberByBlockSize(that, group, matchBlockSize) {
    var ssna = [];
    var candidates = that._groups[group]; // [ssn, ...]

    for (var i = 0, iz = candidates.length; i < iz; ++i) {
        var ssn = candidates[i];
        var bs  = that._blockSizes[ssn];

        if (matchBlockSize === 0 ||  // ignore current block size
            matchBlockSize === bs) { // match current block size
            ssna.push(ssn);
        }
    }
    return ssna;
}

// 画像の格納先として最適なブロックサイズを返す
function _getFitBlockSize(longEdge) { // @arg UINT32 - image long edge
                                      // @ret UINT8 - fit block size (8 to 64)
/*
    | image size(longEdge) | result(BlockSize) | TextureAtlas size |
    |----------------------|-------------------|-------------------|
    |     1 to  128 px     |                 8 |            256 px |
    |    33 to  256 px     |                16 |            512 px |
    |   129 to  512 px     |                32 |           1024 px |
    |   513 to 2048 px     |                64 |           2048 px |
 */
    var minBlockSize = TextureAtlas.MIN_BLOCK_SIZE;

    if (minBlockSize <=  8 && _getBlockSize(longEdge,  8) <= 16) {
        return  8;
    }
    if (minBlockSize <= 16 && _getBlockSize(longEdge, 16) <= 16) {
        return 16;
    }
    if (minBlockSize <= 32 && _getBlockSize(longEdge, 32) <= 16) {
        return 32;
    }
    return 64;
}

function _getBlockSize(longEdge,    // @arg UINT32 - image size
                       blockSize) { // @arg UINT8
    switch (blockSize) {
    case 64: return ((longEdge % 64 === 0) ? longEdge : (((longEdge >>> 6) + 1) << 6)) >>> 6; // 2048px / 32 = 64px/block
    case 32: return ((longEdge % 32 === 0) ? longEdge : (((longEdge >>> 5) + 1) << 5)) >>> 5; // 1024px / 32 = 32px/block
    case 16: return ((longEdge % 16 === 0) ? longEdge : (((longEdge >>> 4) + 1) << 4)) >>> 4; //  512px / 32 = 16px/block
    case  8: return ((longEdge %  8 === 0) ? longEdge : (((longEdge >>> 3) + 1) << 3)) >>> 3; //  256px / 32 =  8px/block
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
// [12] by 〜 bh, bx 〜 bw の空き地を確認したら検索終了。return { ssn, ... bx, by } を返す
// [13] 見つからない場合は null を返す
//
function _findFreeSpace(that,       // @arg this
                        candidates, // @arg SpriteSheetNumberArray - [ssn, ...]
                        sw,         // @arg UINT16 - source width
                        sh) {       // @arg UINT16 - source height
                                    // @ret Object|null - { ssn, bs, bx, by, bw, bh }
    for (var i = 0, iz = candidates.length; i < iz; ++i) {
        var ssn = candidates[i];
        var map = that._maps[ssn];
        var bs  = that._blockSizes[ssn]; // current sprite sheet block size
        var bw  = _getBlockSize(sw, bs); // block width
        var bh  = _getBlockSize(sh, bs); // block height

        for (var by = 0; by < TextureAtlas.ROWS && by + bh <= TextureAtlas.ROWS; ++by) { // [1][2]
            var line = map[by]; // UINT32
            var pops = _getPopulationCount(line); // [3]

            if (pops + bw <= TextureAtlas.COLS) { // [4]
                for (var bx = 0; bx < TextureAtlas.COLS && bx + bw <= TextureAtlas.COLS; ++bx) { // [5][6]
                    // https://gist.github.com/uupaa/6a9094089783e02c2218
                    var bits = (0xFFFFFFFF << (TextureAtlas.COLS - bw)) >>> bx; // [7]
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
                            return { ssn: ssn, bs: bs, bx: bx, by: by, bw: bw, bh: bh };
                        }
                    }
                }
            }
        }
    }
    return null; // [13] not found
}

function _addSpriteSheet(that, // @arg this
                         bs) { // @arg Integer - block size. 8 or 16 or 32 or 64
                               // @ret UINT8 - new sprite sheet number.
    // OpenGLES 2.0 spec, see http://answers.unity3d.com/questions/563094/mobile-max-texture-size.html
    var TEXTURE_SIZE = bs * TextureAtlas.COLS; // 2048 = 64 * 32;

    var canvas = document.createElement("canvas");
    canvas.width  = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;

    var ssn = that._spriteSheets.push(canvas) - 1; // sprite sheet number.

    that._ctxs[ssn] = canvas.getContext("2d");
    that._maps[ssn] = new Uint32Array(TextureAtlas.ROWS); // 32 lines

    if (TextureAtlas["VERBOSE"] && global["document"]) {
        var bgcolor = { "8": "lightcyan", "16": "aquamarine", "32": "turquoise", "64": "lightseagreen" }[bs];
        canvas.style.cssText = "background-color:" + bgcolor;
        document.body.appendChild(canvas);

        if (TextureAtlas["VERBOSE_VERBOSE"]) {
            // --- draw grid pattern ---
            that._ctxs[ssn].beginPath();
            for (var grid = 0; grid < TEXTURE_SIZE; grid += bs) {
                that._ctxs[ssn].moveTo(grid, 0);
                that._ctxs[ssn].lineTo(grid, TEXTURE_SIZE - 1);
                that._ctxs[ssn].moveTo(0, grid);
                that._ctxs[ssn].lineTo(TEXTURE_SIZE - 1, grid);
            }
            that._ctxs[ssn].stroke();
            that._ctxs[ssn].closePath();
        }
    }
    return ssn; // new sprite sheet number
}

// 論理配置(0 -> 1)
function _logicalMapping(map, bx, by, bw, bh) {
    var bits = (0xFFFFFFFF << (TextureAtlas.COLS - bw)) >>> bx;

    for (var byz = by + bh; by < byz; ++by) {
        map[by] |= bits;
    }
}

// 論理配置(1 -> 0)
function _logicalUnmapping(map, bx, by, bw, bh) {
    var bits = ~(0xFFFFFFFF << (TextureAtlas.COLS - bw)) >>> bx;

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

function TextureAtlas_keys() { // @ret IDStringArray - [id, ...]
    return Object.keys(this._imageData);
}

function TextureAtlas_remove(ids) { // @arg IDString|IDStringArray - id or [id, ...]

//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(ids, "IDString|IDStringArray"), TextureAtlas_remove, "ids");
    }
//}@dev

    var idArray = Array.isArray(ids) ? ids : [ids];
    var ssna = [];

    for (var i = 0, iz = idArray.length; i < iz; ++i) {
        var id = idArray[i];
        var data = this._imageData[id]; // { ssn, bs, sw, sh, bx, by, bw, bh }

        if (data) {
            var ssn = data.ssn;
            var bs  = data.bs;

            _logicalUnmapping(this._maps[ssn], data.bx, data.by, data.bw, data.bh);

            this._ctxs[ssn].clearRect(data.bx * bs, data.by * bs, data.sw, data.sh);
          //this._imageData[id] = null; // As you know this code is quick, but becomes a little complex.
            delete this._imageData[id];

            ssna.push(ssn);
            if (this._useCache) {
                this._cacheState[ssn] = TextureAtlas.DIRTY;
                this._dirty = true;
            }
        }
    }
}

function TextureAtlas_clear() {
    this._blockSizes    = {};
    this._groups        = { "": [] };
    this._maps          = [];
    this._ctxs          = [];
    this._spriteSheets  = [];
    this._imageData     = {};
    _removeCache(this, Object.keys(this._imageCache));
    this._imageCache    = {};
    this._cacheState    = {};
    this._dirty         = false;
}

// === Utility =============================================
function TextureAtlas_dump(ssn) { // @arg SpriteSheetNumber = undefined
    if (ssn === undefined) { // dump all
        this._maps.forEach(function(map, index) {
            console.log("SpriteSheetNumber: " + index);
            _dump(map);
        });
    } else {
        _dump(this._maps[ssn]);
    }

    function _dump(map) {
        for (var y = 0; y < TextureAtlas.ROWS; ++y) {
            console.log( (y < 10 ? ("0" + y) : y) + ":", _bin(map[y]) );
        }
    }
}

function _bin(num) {
    var binary32 = "00000000000000000000000000000000";
    var bin = (binary32 + num.toString(2)).slice(-32);

    return bin.replace(/(\d)(?=(\d\d\d\d)+(?!\d))/g, "$1,");
}

function TextureAtlas_imageLoader(resources,    // @arg Array - [HTMLImageElement, URLString, BlobURLString ...]
                                  callback,     // @arg Function - callback(images:HTMLImageElementArray):void
                                  errorback,    // @arg Function = null - errorback(error:Error):void
                                  onprogress) { // @arg Function = null - onprogress(image:HTMLImageElement, index:UINT16):void

//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(resources,  "Array"),    TextureAtlas_imageLoader, "resources");
        $valid($type(callback,   "Function"), TextureAtlas_imageLoader, "callback");
        $valid($type(errorback,  "Function"), TextureAtlas_imageLoader, "errorback");
        $valid($type(onprogress, "Function"), TextureAtlas_imageLoader, "onprogress");
        for (var i = 0, iz = resources.length; i < iz; ++i) {
            if (resources[i] instanceof HTMLImageElement) {
                $valid(resources[i].src !== "", TextureAtlas_imageLoader, "resources");
            } else if (typeof resources[i] === "string") {
                $valid(URI.isBlob(resources[i]) || URI.isValid(resources[i]), TextureAtlas_imageLoader, "resources");
            }
        }
    }
//}@dev

    var NOP = function() {};
    var result = {
            images: [],
            loadedCount: 0
        };

    _imageLoader(result,
                 resources, 0, resources.length,
                 callback, errorback || NOP, onprogress || NOP);
}

function _imageLoader(result,
                      resources, index, length,
                      callback, errorCallback, onprogress) { // @recursive
    if (result.loadedCount >= length) { // success
        callback(result.images);
    } else {
        var res = resources[index]; // HTMLImageElement or URLString or BlobURLString

        if (res instanceof HTMLImageElement) {
            result.images[index] = res;
            result.loadedCount++;
            onprogress(res, index);
            _imageLoader(result,
                         resources, index + 1, length,
                         callback, errorCallback, onprogress);
        } else if (typeof res === "string") { // URLString or BlobURLString
            var img = document.createElement("img");

            img.onload = function() {
                result.images[index] = img;
                result.loadedCount++;
                onprogress(img, index);
                _imageLoader(result,
                             resources, index + 1, length,
                             callback, errorCallback, onprogress);
            };
            img.onerror = function() {
                errorCallback(new Error("IMAGE LOAD ERROR: " + res));
            };
            img.src = res;
        }
    }
}

function $now() {
    return GLOBAL["performance"] ? GLOBAL["performance"].now() : Date.now();
}

return TextureAtlas; // return entity

});

