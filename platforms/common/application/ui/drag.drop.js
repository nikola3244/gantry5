"use strict";

var prime      = require('prime'),
    Emitter    = require('prime/emitter'),
    Bound      = require('prime-util/prime/bound'),
    Options    = require('prime-util/prime/options'),
    bind       = require('mout/function/bind'),
    contains   = require('mout/array/contains'),
    DragEvents = require('./drag.events'),
    $          = require('../utils/elements.moofx');
// $ utils
require('elements/events');
require('elements/delegation');
//require('elements/insertion');
//require('elements/attributes');

var isIE = (navigator.appName === "Microsoft Internet Explorer");

var DragDrop = new prime({

    mixin: [Bound, Options],

    inherits: Emitter,

    options: {
        delegate: null,
        droppables: false,
        catchClick: false
    },

    EVENTS: DragEvents,

    constructor: function (container, options) {
        this.container = $(container);
        if (!this.container) { return; }
        this.setOptions(options);

        this.element = null;
        this.origin = {
            x: 0,
            y: 0,
            transform: null,
            offset: {
                x: 0,
                y: 0
            }
        };

        this.matched = false;
        this.lastMatched = false;
        this.lastOvered = null;

        this.attach();
    },

    attach: function () {
        this.container.delegate(this.EVENTS.START, this.options.delegate, this.bound('start'));
    },

    detach: function () {
        this.container.undelegate(this.EVENTS.START, this.options.delegate, this.bound('start'));
    },

    start: function (event, element) {
        clearTimeout(this.scrollInterval);
        this.scrollHeight = document.body.scrollHeight;

        // prevents dragging a column from itself and limiting to its handle
        var target = $(event.target);
        if (element.hasClass('g-block') && (!target.hasClass('submenu-reorder') && !target.parent('.submenu-reorder'))) { return true; }


        if (event.which && event.which !== 1 || $(event.target).matches(this.options.exclude)) { return true; }
        this.element = $(element);
        this.matched = false;
        if (this.options.catchClick) { this.moved = false; }

        this.emit('dragdrop:beforestart', event, this.element);

        // stops default MS touch actions since preventDefault doesn't work
        if (isIE) {
            this.element.style({
                '-ms-touch-action': 'none',
                'touch-action': 'none'
            });
        }

        // stops text selection
        event.preventDefault();

        this.origin = {
            x: event.changedTouches ? event.changedTouches[0].pageX : event.pageX,
            y: event.changedTouches ? event.changedTouches[0].pageY : event.pageY,
            transform: this.element.compute('transform')
        };

        var clientRect = this.element[0].getBoundingClientRect();
        this.origin.offset = {
            clientRect: clientRect,
            x: this.origin.x - clientRect.right,
            y: clientRect.top - this.origin.y
        };

        // only allow to sort grids when targeting the left handle
        if (this.element.data('lm-blocktype') === 'grid' && Math.abs(this.origin.offset.x) < clientRect.width) {
            return false;
        }


        var offset = Math.abs(this.origin.offset.x),
            columns = (this.element.parent().data('lm-blocktype') === 'grid' && this.element.parent().parent().data('lm-root')) ||
                      (this.element.parent().parent().data('lm-blocktype') == 'container' && this.element.parent().parent().parent().data('lm-root'));

        if (
            this.element.data('lm-blocktype') == 'grid' &&
            (this.element.parent().data('lm-blocktype') === 'container' && this.element.parent().parent().parent().data('lm-root')) ||
            (this.element.parent().data('lm-blocktype') === 'section' && this.element.parent().parent().parent().data('lm-root'))
        ) { columns = false; }

        // resizing and only if it's not a non-visible section
        if ((offset < 6 && this.element.parent().find(':last-child') !== this.element) || (columns && offset > 3 && offset < 10)) {
            if (this.element.parent('[data-lm-blocktype="non-visible"]')) { return false; }

            this.emit('dragdrop:resize', event, this.element, this.element.siblings(':not(.placeholder)'), this.origin.offset.x);
            return false;
        }

        if (columns) { return false; }

        this.element.style({
            'pointer-events': 'none',
            zIndex: 100
        });

        $(document).on(this.EVENTS.MOVE, this.bound('move'));
        $(document).on(this.EVENTS.STOP, this.bound('stop'));
        this.emit('dragdrop:start', event, this.element);

        return this.element;
    },

    stop: function (event) {
        clearTimeout(this.scrollInterval);
        if (!this.moved && this.options.catchClick) {
            // this is just a click
            this.element.style({transform: this.origin.transform || 'translate(0, 0)'});
            this.emit('dragdrop:stop', event, this.matched, this.element);
            this._removeStyleAttribute(this.element);
            this.emit('dragdrop:stop:animation', this.element);
            this.emit('dragdrop:click', event, this.element);

            $(document).off(this.EVENTS.MOVE, this.bound('move'));
            $(document).off(this.EVENTS.STOP, this.bound('stop'));
            this.element = null;

            return;
        }


        var settings = { duration: '250ms' };

        if (this.removeElement) { return this.emit('dragdrop:stop:erase', event, this.element); }

        if (this.element) {

            this.emit('dragdrop:stop', event, this.matched, this.element);

            /*this.element.style({
             position: 'absolute',
             width: 'auto',
             height: 'auto'
             });*/

            if (this.matched) {
                this.element.style({
                    opacity: 0,
                    transform: 'translate(0, 0)'
                }).removeClass('active');
            }

            if (!this.matched) {

                settings.callback = bind(function (element) {
                    this._removeStyleAttribute(element);
                    setTimeout(bind(function(){
                        this.emit('dragdrop:stop:animation', element);
                    }, this), 1);
                }, this, this.element);

                this.element.animate({
                    transform: this.origin.transform || 'translate(0, 0)',
                    opacity: 1
                }, settings);
            } else {

                this.element.style({
                    transform: this.origin.transform || 'translate(0, 0)',
                    opacity: 1
                });

                this._removeStyleAttribute(this.element);
                this.emit('dragdrop:stop:animation', this.element);
            }
        }

        $(document).off(this.EVENTS.MOVE, this.bound('move'));
        $(document).off(this.EVENTS.STOP, this.bound('stop'));
        this.element = null;
    },

    move: function (event) {
        if (this.options.catchClick) {
            var didItMove = {
                x: event.changedTouches ? event.changedTouches[0].pageX : event.pageX,
                y: event.changedTouches ? event.changedTouches[0].pageY : event.pageY
            };

            if (Math.abs(didItMove.x - this.origin.x) <= 3 && Math.abs(didItMove.y - this.origin.y) <= 3) {
                return;
            }

            if (!this.moved) {
                this.element.style({ opacity: 0.5 });
                this.emit('dragdrop:move:once', this.element);
            }

            this.moved = true;
        }

        var clientX = event.clientX || (event.touches && event.touches[0].clientX) || 0,
            clientY = event.clientY || (event.touches && event.touches[0].clientY) || 0,
            overing = document.elementFromPoint(clientX, clientY),
            isGrid = this.element.data('lm-blocktype') === 'grid';


        // logic to autoscroll on drag
        var scrollHeight = this.scrollHeight,
            Height = document.body.clientHeight,
            Scroll = document.body.scrollTop;

        clearTimeout(this.scrollInterval);
        if (clientY + 50 >= Height && Scroll + Height < scrollHeight) {
            this.scrollInterval = setInterval(function(){
                window.scrollTo(document.body.scrollLeft, Math.min(scrollHeight, document.body.scrollTop + 4));
            }, 8);
        } else if (clientY - 50 <= 100 && scrollHeight > 0) {
            this.scrollInterval = setInterval(function(){
                window.scrollTo(document.body.scrollLeft, Math.max(0, document.body.scrollTop - 4));
            }, 8);
        }

        // we tweak the overing to take into account the negative offset for the handle
        if (isGrid) {
            // more accurate is: clientX + (this.element[0].getBoundingClientRect().left - clientX)
            overing = document.elementFromPoint(clientX + 30, clientY);
        }

        if (!overing) { return false; }

        this.matched = $(overing).matches(this.options.droppables) ? overing : ($(overing).parent(this.options.droppables) || [false])[0];
        this.isPlaceHolder = $(overing).matches('[data-lm-placeholder]') ? true : ($(overing).parent('[data-lm-placeholder]') ? true : false);
        // we only allow new particles to go anywhere and particles to reposition within the grid boundaries
        // and we only allow grids sorting within the same section only
        /*if (this.matched && this.element.data('lm-id')) {
            if ($(this.matched).parent('.grid') !== this.element.parent('.grid') || $(this.matched).parent('.section') !== this.element.parent('.section')) {
                this.matched = false;
            }
        }*/

        var deltaX = this.lastX - clientX,
            deltaY = this.lastY - clientY,
            direction = Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0 && 'left' ||
                Math.abs(deltaX) > Math.abs(deltaY) && deltaX < 0 && 'right' ||
                Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0 && 'up' ||
                'down';


        deltaX = (event.changedTouches ? event.changedTouches[0].pageX : event.pageX) - this.origin.x;
        deltaY = (event.changedTouches ? event.changedTouches[0].pageY : event.pageY) - this.origin.y;

        //console.log('x', this.origin.x, 'y', this.origin.y, 'ox', this.origin.offset.x, 'oy', this.origin.offset.y, 'dx', deltaX, 'dy', deltaY);

        this.direction = direction;
        this.element.style({ transform: 'translate(' + deltaX + 'px, ' + deltaY + 'px)' });

        if (!this.isPlaceHolder) {
            if (this.lastMatched && this.matched !== this.lastMatched) {
                this.emit('dragdrop:leave', event, this.lastMatched, this.element);
                this.lastMatched = false;
            }

            if (this.matched && this.matched !== this.lastMatched && overing !== this.lastOvered) {
                this.emit('dragdrop:enter', event, this.matched, this.element);
                this.lastMatched = this.matched;
            }

            if (this.matched && this.lastMatched) {
                var rect = this.matched.getBoundingClientRect();
                var x = clientX - rect.left,
                    y = clientY - rect.top;

                // note: you can divide x axis by 3 rather than 2 for 4 directions
                var location = {
                    x: Math.abs((clientX - rect.left)) < (rect.width / 2) && 'before' ||
                    Math.abs((clientX - rect.left)) >= (rect.width - (rect.width / 2)) && 'after' ||
                    'other',
                    y: Math.abs((clientY - rect.top)) < (rect.height / 2) && 'above' ||
                    Math.abs((clientY - rect.top)) >= (rect.height / 2) && 'below' ||
                    'other'
                };

                //if (!equals(location, this.lastLocation)){
                this.emit('dragdrop:location', event, location, this.matched, this.element);
                this.lastLocation = location;
                //}
            } else {
                this.emit('dragdrop:nolocation', event);
            }
        }

        this.lastOvered = overing;
        this.lastDirection = direction;
        this.lastX = clientX;
        this.lastY = clientY;

        this.emit('dragdrop:move', event, this.element);
    },

    _removeStyleAttribute: function (element) {
        element = $(element || this.element);
        if (element.data('mm-id')) { return; }

        element.attribute('style', null);//.style({flex: flex});
        //$(element || this.element).style({'pointer-events': 'auto', 'position': 'inherit', 'z-index': 'inherit'});
    }

});

module.exports = DragDrop;
