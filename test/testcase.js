var ModuleTestTextureAtlas = (function(global) {

var _isNodeOrNodeWebKit = !!global.global;
var _runOnNodeWebKit =  _isNodeOrNodeWebKit &&  /native/.test(setTimeout);
var _runOnNode       =  _isNodeOrNodeWebKit && !/native/.test(setTimeout);
var _runOnWorker     = !_isNodeOrNodeWebKit && "WorkerLocation" in global;
var _runOnBrowser    = !_isNodeOrNodeWebKit && "document" in global;

var test = new Test("TextureAtlas", {
        disable:    false, // disable all tests.
        browser:    true,  // enable browser test.
        worker:     false, // enable worker test.
        node:       false, // enable node test.
        nw:         false, // enable nw.js test.
        button:     false, // show button.
        both:       false, // test the primary and secondary modules.
        ignoreError:false, // ignore error.
    });

if (_runOnBrowser || _runOnNodeWebKit) {
    test.add([
        testImageLoad,
        testRemove,
        testRandomAdd,
    ]);
} else if (_runOnWorker) {
    //test.add([]);
} else if (_runOnNode) {
    //test.add([]);
}

// --- test cases ------------------------------------------
var imageList = [
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/tree.png",

        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG-Fadeout.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG-from-GIF-LostWorld.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG-from-GIF-Mouse.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG-Glass.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG-Icos4D.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/clock.apng.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/Gold.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/o_sample.png",

        "../node_modules/uupaa.testresource.js/assets/png/codec-test/tree.png",
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/tree-copy1.png",
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/tree-copy2.png",
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/tree-copy3.png",

        "../node_modules/uupaa.testresource.js/assets/png/codec-test/24x8.png",
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/3x3.png",
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/pause.png",
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/play.png",
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/play_o.png",
        "../node_modules/uupaa.testresource.js/assets/png/render-test/basn2c08.png",
        "../node_modules/uupaa.testresource.js/assets/png/render-test/basn3p08.png",
        "../node_modules/uupaa.testresource.js/assets/png/render-test/basn6a08.png",
        "../node_modules/uupaa.testresource.js/assets/png/render-test/bgan6a08.png",
        "../node_modules/uupaa.testresource.js/assets/png/render-test/tbbn3p08.png",
        "../node_modules/uupaa.testresource.js/assets/png/render-test/tp0n2c08.png",
        "../node_modules/uupaa.testresource.js/assets/png/render-test/z00n2c08.png",
    ];
TextureAtlas["VERBOSE"] = true;
TextureAtlas["VERBOSE_VERBOSE"] = true;

global.images = [];
global.random = new Random();
global.sprite = new TextureAtlas();
global.canvas = document.createElement("canvas");
global.canvas.width = 1200;
global.canvas.height = 1200;
global.canvas.style.cssText = "background: green; border: 1px solid red";
document.body.appendChild(global.canvas);



function testImageLoad(test, pass, miss) {
    TextureAtlas.imageLoader(imageList, function(images) {
        global.images = images;
        onimageloaded(images);
    }, function(error) {
        test.done(miss());
        //throw error;
    }, function(image) {
        console.log("image loaded: " + image.src);
        global.sprite.add(image.src, image);
        global.sprite.dump();
    });

    function onimageloaded(images) {
        var ctx = global.canvas.getContext("2d");

        for (var i = 0, iz = images.length; i < iz; ++i) {
            global.sprite.draw(images[i].src, ctx, i * 32, i * 32);
        }

        test.done(pass());
    }
}

function testRemove(test, pass, miss) {

    var keys = global.sprite.keys();

    keys.forEach(function(key) {
        global.sprite.remove(key);
    });
    global.sprite.dump();

    if (global.sprite.keys().length === 0) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testRandomAdd(test, pass, miss) {
    global.images.sort(function(a, b) {
        var r = global.random.next() % 2;

        if (r) {
            return 1;
        }
        return 0;
    }).forEach(function(image) {
        global.sprite.add(image.src, image);
    });
    global.sprite.dump();

    test.done(pass());
}

return test.run().clone();

})((this || 0).self || global);

