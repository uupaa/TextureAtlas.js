(function(global) {
"use strict";

// --- dependency modules ----------------------------------
//{@dev
var URI = global["URI"];
//}@dev

// --- define / local variables ----------------------------
//var _isNodeOrNodeWebKit = !!global.global;
//var _runOnNodeWebKit =  _isNodeOrNodeWebKit &&  /native/.test(setTimeout);
//var _runOnNode       =  _isNodeOrNodeWebKit && !/native/.test(setTimeout);
//var _runOnWorker     = !_isNodeOrNodeWebKit && "WorkerLocation" in global;
//var _runOnBrowser    = !_isNodeOrNodeWebKit && "document" in global;

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
    this._blockSizes    = {};  // block sizes. { ssn: blockSize, ... }
    this._groups        = { "": [] }; // group names. { group: [ssn, ...] }
    this._maps          = [];  // logical grid data(32 x 32 grids). [Uint32Array(32), ...]
    this._ctxs          = [];  // sprite sheets(canvas) contexts. [ctx, ...]
    this._spriteSheets  = [];  // sprite sheets(canvas). [HTMLCanvasElement, ...]
    this._imageData     = {};  // image data. { id: { ssn, bs, sw, sh, bx, by, bw, bh }, ... }
                               //       ssn: sprite sheet number to store
                               //       bs:  block size
                               //       sw:  source image width
                               //       sh:  source image height
                               //       bx:  block x in sprite sheet
                               //       by:  block y in sprite sheet
                               //       bw:  block width in sprite sheet
                               //       bh:  block height in sprite sheet
    this._imageCache    = {};  // image cache make from blob. { ssn: Image, ... }
    this._cacheState    = {};  // cache state. { ssn: state }. CACHED, PROGRESS, DIRTY
}

TextureAtlas.COLS = 32;
TextureAtlas.ROWS = 32;
TextureAtlas["VERBOSE"] = false;
TextureAtlas["VERBOSE_VERBOSE"] = false;
TextureAtlas.CASHE_STATE_CACHED   = 0;
TextureAtlas.CASHE_STATE_PROGRESS = 1;
TextureAtlas.CASHE_STATE_DIRTY    = 2;

TextureAtlas["prototype"] = Object.create(TextureAtlas, {
    "constructor":  { "value": TextureAtlas             },  // new TextureAtlas():TextureAtlas
    "has":          { "value": TextureAtlas_has         },  // TextureAtlas#has(id:String):Boolean
    "get":          { "value": TextureAtlas_get         },  // TextureAtlas#get(id:String):Object|null
    "add":          { "value": TextureAtlas_add         },  // TextureAtlas#add(resources:ResourceArray, group:String = "", separate:Integer = 0):void
    "draw":         { "value": TextureAtlas_draw        },  // TextureAtlas#draw(id:String, ctx:CanvasRenderingContext2D, dx:INT16, dy:INT16, dw:UINT16, dh:UINT16):void
    "keys":         { "value": TextureAtlas_keys        },  // TextureAtlas#keys():IDStringArray
//  "tile":         { "value": TextureAtlas_tile        },  // TextureAtlas#tile(width:UINT16, height:UINT16, length:UINT16):TilingDataArray - [ { ssn, i, bx, by, bw, bh }, ... ]
    "remove":       { "value": TextureAtlas_remove      },  // TextureAtlas#remove(ids:IDString|IDStringArray):void
    "clear":        { "value": TextureAtlas_clear       },  // TextureAtlas#clear():void
    "dump":         { "value": TextureAtlas_dump        },  // TextureAtlas#dump(ssn:SpriteSheetNumber = undefined):void
    "updateCache":  { "value": TextureAtlas_updateCache },  // TextureAtlas#updateCache():void
});
TextureAtlas["imageLoader"] = TextureAtlas_imageLoader; // TextureAtlas.imageLoader(resource:Array, callback:Function, errorback:Function = null, onprogress:Function = null):void

// --- implements ------------------------------------------
function TextureAtlas_draw(id,   // @arg String
                           ctx,  // @arg CanvasRenderingContext2D
                           dx,   // @arg INT16
                           dy,   // @arg INT16
                           sx,   // @arg Number = 1 - scale x
                           sy) { // @arg Number = 1 - scale y
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(id,  "String"),      TextureAtlas_draw, "id");
        $valid($type(ctx, "CanvasRenderingContext2D"), TextureAtlas_draw, "ctx");
        $valid($type(dx,  "INT16"),       TextureAtlas_draw, "dx");
        $valid($type(dy,  "INT16"),       TextureAtlas_draw, "dy");
        $valid($type(sx,  "Number|omit"), TextureAtlas_draw, "sx");
        $valid($type(sy,  "Number|omit"), TextureAtlas_draw, "sy");
    }
//}@dev

    var data = this._imageData[id]; // { ssn, bs, sw, sh, bx, by, bw, bh }

    if (data) {
        var blockSize = data.bs;
        var ssn = data.ssn;
        var img = this._spriteSheets[ssn];

        if (this._useCache) {
            switch (this._cacheState[ssn]) {
            case TextureAtlas.CASHE_STATE_CACHED: img = this._imageCache[ssn]; break;
            case TextureAtlas.CASHE_STATE_DIRTY:  _updateCache(this, ssn, this._async);
            }
        }
        ctx.drawImage(img,
                      data.bx * blockSize,
                      data.by * blockSize,
                      data.sw,
                      data.sh,
                      dx,
                      dy,
                      data.sw * (sx || 1),
                      data.sh * (sy || 1));
    }
}

function TextureAtlas_updateCache() {
    if (this._useCache) {
        var ssna = Object.keys(this._cacheState);
        for (var i = 0, iz = ssna.length; i < iz; ++i) {
            if (ssna[i] === TextureAtlas.CASHE_STATE_DIRTY) {
                _updateCache(this, ssna[i], this._async);
            }
        }
    }
}

function _updateCache(that, ssn, async) {
    that._cacheState[ssn] = TextureAtlas.CASHE_STATE_PROGRESS;
    if (ssn in that._imageCache) {
        URL.revokeObjectURL( that._imageCache[ssn].url );
    }

    if (TextureAtlas["VERBOSE"]) { var a = $now(); }

    _toBlob(that._spriteSheets[ssn], "image/png", async, function(blob) {
        var img = new Image();
        img.src = URL.createObjectURL(blob);
        that._imageCache[ssn] = img;
        that._cacheState[ssn] = TextureAtlas.CASHE_STATE_CACHED;

        if (TextureAtlas["VERBOSE"]) {
            console.log("updateCache: [" + ssn + "]:" + ($now() - a) + "ms" )
        }
    });

    function _toBlob(canvas, mimeType, async, callback) {
        if (async) {
            var xhr = new XMLHttpRequest;
            xhr.open("GET", canvas.toDataURL(mimeType) );
            xhr.responseType = "arraybuffer";
            xhr.onload = function() {
                callback( new Blob( [xhr.response], { "type": mimeType } ) );
            };
            xhr.send();
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

function TextureAtlas_has(id) { // @arg String
                                // @ret Boolean
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(id, "String"), TextureAtlas_has, "id");
    }
//}@dev

    return !!this._imageData[id];
}

function TextureAtlas_get(id) { // @arg String
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

function TextureAtlas_add(resources,  // @arg ResourceArrayArray|ResourceObjectArray - [[source, id, rect ] or { source, id, rect }, ...]
                          group,      // @arg String = "" - group name.
                          separate) { // @arg Integer = 0 - separate mode (0, 1, 2)
                                      // @resource.id     String
                                      // @resource.source HTMLImageElement|HTMLCanvasElement
                                      // @resource.rect   IntegerArray|RectObject - [x:UINT16 = 0, y:UINT16 = 0, w:UINT16 = source.width, h:UINT16 = source.height]
//{@dev
    if (!global["BENCHMARK"]) {
        $valid($type(resources, "Array"),        TextureAtlas_add, "resources");
        $valid($type(group,     "String|omit"),  TextureAtlas_add, "group");
        $valid($type(separate,  "Integer|omit"), TextureAtlas_add, "separate");
    }
//}@dev

    group    = group    || "";
    separate = separate || 0;

    if ( !(group in this._groups) ) {
        this._groups[group] = [];
    }

    var ssna = [];

    for (var i = 0, iz = resources.length; i < iz; ++i) {
        var res    = resources[i]; // [source, id = "", rect = null] or { source, id = "", rect = null }
        var source = res[0] || res["source"];
        var id     = res[1] || res["id"] || source.src || source.id; // HTMLImageElement#src or HTMLCanvasElement#id
        var isimg  = source instanceof HTMLImageElement;
        var rect   = res[2] || res["rect"] || [0, 0, isimg ? source.naturalWidth  : source.width,
                                                     isimg ? source.naturalHeight : source.height];
        var sx = rect[0] || rect.x || 0;
        var sy = rect[1] || rect.y || 0;
        var sw = rect[2] || rect.w || 0;
        var sh = rect[3] || rect.h || 0;

        if (id in this._imageData) { // id is already exists -> skip
            continue;
        }
        var fitBlockSize = _findFitBlockSize(sw, sh);
        var candidate = []; // [ssn, ...]

        switch (separate) {
        case 0:
            // スプライトシートリストの先頭から検索し、
            // 空き地が見つかった順に追加を試みる。
            // ブロックサイズは無視する
            candidate = _filterSpriteSheetNumberByGroupAndBlockSize(this, group, 0); // match all
            break;
        case 1:
            // スプライトシートリストを先頭から検索し、
            // fitBlockSize と一致するブロックサイズを持ったスプライトシートに空き地があるか検索する。
            // 見つからない場合は、separate = 0 が指定された場合と同じ条件で再検索を行う
            candidate = _filterSpriteSheetNumberByGroupAndBlockSize(this, group, fitBlockSize);
            if (!candidate.length) {
                candidate = _filterSpriteSheetNumberByGroupAndBlockSize(this, group, 0); // match all
            }
            break;
        case 2:
            // スプライトシートリストを先頭から検索し、
            // fitBlockSize と一致するブロックサイズを持ったスプライトシートに空き地があるか検索する。
            // 見つからない場合は空き地無しとして検索を終了する
            // 結果的に、新しくスプライトシート(プロックサイズはfitBlockSize)が追加され、そこに画像を追加する
            candidate = _filterSpriteSheetNumberByGroupAndBlockSize(this, group, fitBlockSize);
        }

        // 画像を格納するために必要な論理ブロックサイズを求める
        var ssn = 0; // sprite sheet number
        var bx  = 0; // block x (0 is left)
        var by  = 0; // block y (0 is top)
        var bw  = _getBlockSize(sw, fitBlockSize); // block width
        var bh  = _getBlockSize(sh, fitBlockSize); // block height

        // 空き地を検索
        var freeSpace = null;
        var blockSize = fitBlockSize;

        if (candidate.length) {
            freeSpace = _findFreeSpace(this._maps, candidate, bw, bh); // { ssn:UINT8, bx:UINT16, by:UINT16 } or null
        }
        if (freeSpace) {
            ssn = freeSpace.ssn;
            bx  = freeSpace.bx;
            by  = freeSpace.by;
            // separate = 1 で再検索した場合に、最適ではない blockSize が選択されている可能性があるため再取得する
            blockSize = this._blockSizes[ssn];
        } else {
            // 空きスペースが無ければ、新しいスプライトシートを追加し左上(bx:0,by:0)に配置する
            ssn = _addSpriteSheet(this, blockSize);
            this._blockSizes[ssn] = blockSize;
            this._groups[group].push(ssn);
        }

        _add(this, id, source, ssn, blockSize, sx, sy, sw, sh, bx, by, bw, bh);
        ssna.push(ssn);
        this._cacheState[ssn] = TextureAtlas.CASHE_STATE_DIRTY;
    }
}

function _add(that, id, source, ssn, blockSize, sx, sy, sw, sh, bx, by, bw, bh) {
    // 画像の情報と保存先のスプライトシート座標を保存
    that._imageData[id] = {
        ssn: ssn, // sprite sheet number
        bs: blockSize,
        sw: sw,   // source width
        sh: sh,   // source height
        bx: bx,   // block x
        by: by,   // block y
        bw: bw,   // block width
        bh: bh    // block height
    };

    // 論理配置: 空き地に画像を配置
    _logicalMapping(that._maps[ssn], bx, by, bw, bh);

    // 物理配置: スプライトシートに画像を配置
    that._ctxs[ssn].drawImage(source, sx, sy, sw, sh,
                                      bx * blockSize, by * blockSize, sw, sh);
}

// グループ内の ssn を blockSize でフィルタリングする
function _filterSpriteSheetNumberByGroupAndBlockSize(that, group, matchBlockSize) {
    var result = [];
    var ssna = that._groups[group]; // { group: [ssn, ...] }

    for (var i = 0, iz = ssna.length; i < iz; ++i) {
        var ssn = ssna[i];
        var blockSize = that._blockSizes[ssn];

        if (matchBlockSize === 0) {
            result.push(ssn);
        } else if (blockSize === matchBlockSize) {
            result.push(ssn);
        }
    }
    return result;
}

function _findFitBlockSize(sw, sh) {
    var s8  = Math.max(_getBlockSize(sw, 8),  _getBlockSize(sh, 8));
    if (s8 <= 4) {  // 1 to 32px -> 8
        return 8;
    }
    var s16 = Math.max(_getBlockSize(sw, 16), _getBlockSize(sh, 16));
    if (s16 <= 4) { // 33 to 64px -> 16
        return 16;
    }
    var s32 = Math.max(_getBlockSize(sw, 32), _getBlockSize(sh, 32));
    if (s32 <= 4) { // 65 to 128px -> 32
        return 32;
    }
    var s64 = Math.max(_getBlockSize(sw, 64), _getBlockSize(sh, 64));
    return 64;      // 129 to 2048px -> 64
}

function _getBlockSize(size, blockSize) {
    switch (blockSize) {
    case 64: return ((size % 64 === 0) ? size : (((size >>> 6) + 1) << 6)) >>> 6; // 2048px / 32 = 64px/block
    case 32: return ((size % 32 === 0) ? size : (((size >>> 5) + 1) << 5)) >>> 5; // 1024px / 32 = 32px/block
    case 16: return ((size % 16 === 0) ? size : (((size >>> 4) + 1) << 4)) >>> 4; //  512px / 32 = 16px/block
    case  8: return ((size %  8 === 0) ? size : (((size >>> 3) + 1) << 3)) >>> 3; //  256px / 32 =  8px/block
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
function _findFreeSpace(maps,      // @arg Uint32ArrayArray - logical grid data.
                        candidate, // @arg SpriteSheetNumberArray - [ssn, ...]
                        bw,        // @arg UINT8 - block width, from 1 to 32
                        bh) {      // @arg UINT8 - block height, from 1 to 32
                                   // @ret Object|null - { ssn, bx, by }
    for (var i = 0, iz = candidate.length; i < iz; ++i) {
        var ssn = candidate[i];
        var map = maps[ssn];

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
                            return { ssn: ssn, bx: bx, by: by };
                        }
                    }
                }
            }
        }
    }
    return null; // [13] not found
}

function _addSpriteSheet(that,        // @arg this
                         blockSize) { // @arg Integer - 8 or 16 or 32 or 64
                                      // @ret UINT8 - new sprite sheet number.

    // OpenGLES 2.0 spec, see http://answers.unity3d.com/questions/563094/mobile-max-texture-size.html
    var TEXTURE_SIZE = blockSize * TextureAtlas.COLS; // 2048 = 64 * 32;

    var canvas = document.createElement("canvas");
    canvas.width  = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;

    var ssn = that._spriteSheets.push(canvas) - 1; // sprite sheet number.

    that._ctxs[ssn] = canvas.getContext("2d");
    that._maps[ssn] = new Uint32Array(TextureAtlas.ROWS); // 32 lines

    if (TextureAtlas["VERBOSE"] && global["document"]) {
        var bgcolor = { "8": "lime", "16": "navy", "32": "pink", "64": "tomato" }[blockSize];
        canvas.style.cssText = "background-color:" + bgcolor;
        document.body.appendChild(canvas);

        if (TextureAtlas["VERBOSE_VERBOSE"]) {
            // --- draw grid pattern ---
            that._ctxs[ssn].beginPath();
            for (var grid = 0; grid < TEXTURE_SIZE; grid += blockSize) {
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

function _logicalMapping(map, bx, by, bw, bh) {
    var bits = (0xFFFFFFFF << (TextureAtlas.COLS - bw)) >>> bx;

    for (var byz = by + bh; by < byz; ++by) {
        map[by] |= bits;
    }
}

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
            var blockSize = data.bs;

            _logicalUnmapping(this._maps[ssn], data.bx, data.by, data.bw, data.bh);

            this._ctxs[ssn].clearRect(data.bx * blockSize, data.by * blockSize, data.sw, data.sh);
          //this._imageData[id] = null; // As you know this code is quick, but becomes a little complex.
            delete this._imageData[id];

            ssna.push(ssn);
            this._cacheState[ssn] = TextureAtlas.CASHE_STATE_DIRTY;
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
}

// === Utility =============================================
function TextureAtlas_dump(ssn) { // @arg SpriteSheetNumber = undefined
    if (ssn === undefined) { // dump all
        this._maps.forEach(function(map, ssn) {
            console.log("SpriteSheet No: " + ssn);
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

// --- validate / assertions -------------------------------
//{@dev
function $now() { return global["performance"] ? performance.now() : Date.now(); }
function $valid(val, fn, hint) { if (global["Valid"]) { global["Valid"](val, fn, hint); } }
function $type(obj, type) { return global["Valid"] ? global["Valid"].type(obj, type) : true; }
function $keys(obj, str) { return global["Valid"] ? global["Valid"].keys(obj, str) : true; }
//function $some(val, str, ignore) { return global["Valid"] ? global["Valid"].some(val, str, ignore) : true; }
//function $args(fn, args) { if (global["Valid"]) { global["Valid"].args(fn, args); } }
//}@dev

// --- exports ---------------------------------------------
if (typeof module !== "undefined") {
    module["exports"] = TextureAtlas;
}
global["TextureAtlas" in global ? "TextureAtlas_" : "TextureAtlas"] = TextureAtlas;

})((this || 0).self || global); // WebModule idiom. http://git.io/WebModule

