// including plugins
var gulp = require('gulp'),
    $ = require("gulp-load-plugins")({
        pattern: ['gulp-*', 'gulp.*', '@*/gulp{-,.}*','run-sequence','fs'], // the glob(s) to search for
        overridePattern: true
    })/*,
    rename = require('gulp-rename'),
    minifyHtml = require('gulp-minify-html'),
    uglify = require('gulp-uglify'),
    minifyCss = require('gulp-minify-css'),
    jshint = require('gulp-jshint'),
    concat = require('gulp-concat'),
    clean = require('gulp-clean'),
    runSequence = require('run-sequence'),
    header = require("gulp-header"),
    bump = require('gulp-bump'),
    changed = require('gulp-changed'),
    fs = require('fs'),
    stripDebug = require('gulp-strip-debug'),
    gutil = require('gulp-util')*/;

var srcDir = './js',
    distDir = './dist';

$.uglify().on('error', function (err) {
    console.log("11111");
    //$.gulpUtil.log(gutil.colors.red('[Error]'), err.toString());
    //this.emit('end');
});

// Get version
var getVersion = function () {
    var json = JSON.parse($.fs.readFileSync('package.json', 'utf8'));
    return json.version;
};

// Get copyright
var getCopyright = function () {
    var json = JSON.parse($.fs.readFileSync('package.json', 'utf8'));
    return json.license;
};

// Task for minifying/uglifying
gulp.task('minify', function () {
    gulp.src(srcDir + '/**/*.js')
        .pipe($.changed(distDir))
        .pipe($.concat('app.js'))
        .pipe($.stripDebug())
        .pipe($.uglify({
            compress: true,
            mangle: {
                eval: true,
                toplevel: true
            }
        })).on('error', function (err) {
        console.log(err.toString());
        //$.gulpUtil.log(gutil.colors.red('[Error]'), err.toString());
        //this.emit('end');
    })
        .pipe($.header('/**\n*\n* ' + getCopyright() + ' ( version: ' + getVersion() + ' )\n*\n*/\n'))
        .pipe($.rename({suffix: '.min'}))
        .pipe(gulp.dest(distDir + '/js'));

});

// Task for copying local-configuration.json
gulp.task('copy-cfg', function () {
    gulp.src('./local-configuration.json')
        .pipe(gulp.dest('./dist'));
});


// Task for copying images
gulp.task('copy-images', function () {
    gulp.src('./img/*.{png,jpg}')
        .pipe(gulp.dest('./dist/img'));
});

// Task for copying libs
gulp.task('copy-libs', function () {
    gulp.src('./lib/*.js')
        .pipe(gulp.dest('./dist/lib'));
});

// Task for jslinting
gulp.task('jshint', function () {
    gulp.src(srcDir + '/**/*.js')
        .pipe($.jshint())
        .pipe($.jshint.reporter());
});

gulp.task('clean', function () {
    return gulp.src(distDir + '/*.js')
        .pipe($.clean());
});

// Task for minifying demo html
gulp.task('minify-html', function () {
    gulp.src('./*.html')
        .pipe($.minifyHtml())
        .pipe(gulp.dest(distDir));
});

// Task for minifying demo css
gulp.task('minify-css', function () {
    gulp.src('./css' + '/**/*.css')
        .pipe($.minifyCss())
        .pipe(gulp.dest(distDir + '/css'));
});

// Task for cleaning up demo
gulp.task('clean-demo', function () {
    return gulp.src(distDir + '/demo/**/*.*')
        .pipe($.clean({force: true}));
});

// Increase the major version
gulp.task('bump-major', function () {
    return gulp.src('./package.json')
        .pipe($.bump({type: 'major'}))
        .pipe(gulp.dest('./'));
});

// Increase the minor version
gulp.task('bump-minor', function () {
    return gulp.src('./package.json')
        .pipe($.bump({type: 'minor'}))
        .pipe(gulp.dest('./'));
});

// Increase the patch version
gulp.task('bump-patch', function () {
    return gulp.src('./package.json')
        .pipe($.bump({type: 'patch'}))
        .pipe(gulp.dest('./'));
});

// Build distribution version
gulp.task('dist', function (done) {
    $.runSequence('bump-patch', 'clean', 'jshint', 'minify-html', 'minify-css', 'minify', 'copy-images', 'copy-libs', 'copy-cfg', function () {
        console.log('*** Created distribution version in ./dist/  ***');
        done();
    });
});

gulp.task('watch', function () {
    gulp.watch([srcDir + '/**/*.js'], ['dist']);
});

// Use during development with automatic build for each change
gulp.task('dev', function (done) {
    $.runSequence('dist', 'watch', function () {
        console.log('*** Created dev version in ./dist  ***');
        done();
    });
});