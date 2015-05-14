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
/*
        testTextureAtlas_imageLoader,
        testTextureAtlas_remove,
        testTextureAtlas_randomAdd,
 */
        testTextureAtlas_addToGroup,
    ]);
} else if (_runOnWorker) {
    //test.add([]);
} else if (_runOnNode) {
    //test.add([]);
}

// --- test cases ------------------------------------------
var imageList = [
/*
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/tree.png",
 */

        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG-Fadeout.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG-from-GIF-LostWorld.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG-from-GIF-Mouse.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG-Glass.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG-Icos4D.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/APNG.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/clock.apng.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/Gold.png",
        "../node_modules/uupaa.testresource.js/assets/png/animation/o_sample.png",

/*
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/tree.png",
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/tree-copy1.png",
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/tree-copy2.png",
        "../node_modules/uupaa.testresource.js/assets/png/codec-test/tree-copy3.png",
 */

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
//global.atlas  = new TextureAtlas({ useCache: true });
global.atlas  = new TextureAtlas({ useCache: /Chrome/.test(navigator.userAgent) ? true : false });
global.canvas = document.createElement("canvas");
global.canvas.width = 1200;
global.canvas.height = 1200;
global.canvas.style.cssText = "background: green; border: 1px solid red";
document.body.appendChild(global.canvas);



function testTextureAtlas_imageLoader(test, pass, miss) {
    TextureAtlas.imageLoader(imageList, function(images) {
        global.images = images;
        onimageloaded(images);
    }, function(error) {
        test.done(miss());
        //throw error;
    }, function(image, index) {
        console.log("image loaded: " + image.src);
        global.atlas.add(image, image.src);
        global.atlas.dump();
    });

    function onimageloaded(images) {
        var ctx = global.canvas.getContext("2d");

        for (var i = 0, iz = images.length; i < iz; ++i) {
            global.atlas.draw(images[i].src, ctx, i * 32, i * 32);
        }

        test.done(pass());
    }
}

function testTextureAtlas_remove(test, pass, miss) {

    global.atlas.remove( global.atlas.keys() );
    global.atlas.dump();

    if (global.atlas.keys().length === 0) {
        test.done(pass());
    } else {
        test.done(miss());
    }
}

function testTextureAtlas_randomAdd(test, pass, miss) {
    global.images.sort(function(a, b) {
        var r = global.random.next() % 2;

        if (r) {
            return 1;
        }
        return 0;
    }).forEach(function(image) {
        global.atlas.add(image, image.src);
    });
    global.atlas.dump();

    test.done(pass());
}

function testTextureAtlas_addToGroup(test, pass, miss) {
    TextureAtlas.imageLoader(imageList, function(images) {
        global.images = images;
        onimageloaded(images);
    }, function(error) {
        test.done(miss());
        //throw error;
    }, function(image, index) {
        console.log("image loaded: " + image.src);

        // add to group
        //global.atlas.add([ { source: image, id: index, rect: { x: 0, y: 0, w: 32, h: 32 } } ], "mygroup", 0);
        var group = "";
        if (/tree/.test(image.src)) {
            group = "tree";
        }
        //global.atlas.add([ { source: image, id: image.src, rect: { x: 0, y: 0, w: 32, h: 32 } } ], group, 2);
        //global.atlas.add([ { source: image, id: image.src } ], group, 2);
        global.atlas.add(image, image.src, null, group, 2);
    });

    function onimageloaded(images) {
        if (global.atlas.dirty) {
            global.atlas.updateCache();
        }

        var offset = 0;
        function a() {

            var ctx = global.canvas.getContext("2d");

            for (var y = 0; y < 8; ++y) {
                for (var x = 0; x < 8; ++x) {
                    var xy = y * 8 + x;
                    var img = images[(xy % images.length)];

                    global.atlas.draw(img.src, ctx, x * 64, y * 64 + offset);


                }
            }
        }

        setTimeout(a, 2000);
        setTimeout(function() { offset+= 500; a(); }, 5000);

        test.done(pass());
    }
}



return test.run().clone();

})((this || 0).self || global);

