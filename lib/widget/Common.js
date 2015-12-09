function __extend() {
    var __base = arguments[0];
    var sub = arguments[1];

    sub.prototype = Object.create(__base.prototype);
    sub.prototype.constructor = sub;
    sub.__base = __base;

    for (var i = 2; i < arguments.length; i ++) {
        var f = arguments[i];
        sub.prototype[f.name] = f;
    }

    return sub;
}

var widget = {};
widget.random = function() {
    return "" + new Date().getTime() + "_" + Math.round(10000 * Math.random());
};
widget.STATIC_BASE = "";
widget.LOADING = "Loading...";
widget.CACHE_RANDOM = widget.random();

widget.get = function(foo) {
    if (typeof (foo) == "string") return document.getElementById(foo);
    if (foo && foo.nodeType) return foo;
    return null;
};
widget.getId = function (node) {
    var id = node.getAttribute("id");
    if (!id) {
        id = "node_" + widget.random();
        node.setAttribute("id", id);
        try {
            node.id = id;
        } catch (e) {}
    }

    return id;
};

widget.evaluate = function(object, context) {
    if (typeof (object) == "function") {
        return object.apply(context);
    }
    return object;
};
widget.registerEvent = function (target, event, handlerName, capture) {
    Dom.registerEvent(target, event, function (e) {
        var t = Dom.getTarget(e);
        var node = Dom.findUpward(t, function (n) {
            return n._widget;
        });
        if (!node) return;
        var f = node._widget[handlerName];
        if (!f) return;
        f.apply(node._widget, [e]);
    }, capture);
};

function ie() {
    var ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf('msie') != -1) {
        return parseInt(ua.split('msie')[1], 10);
    }
    if (ua.indexOf('trident') != -1) {
        return 11;
    }
    return false;
}

widget.Util = function() {
    var TEMPLATE_CACHE = {};
    return {
        _processTemplateStyleSheet: function (html, prefix, templateName) {
            return html.replace(/(<style[^>]*>)([^<]+)(<\/style>)/g, function (zero, start, content, end) {

                if (ie() && ie() < 10) {
                    if (!window.processedStyle) window.processedStyle = {};
                    if (window.processedStyle[templateName]) return "";
                    prefix = "." + templateName;
                }

                var css = content.replace(/([\r\n ]+)([^\{\}]+)\{/g, function (zero, leading, selectors) {
                    selectors = selectors.replace(/@([a-z])/gi, ".AnonId_$1");
                    selectors = selectors.replace(/[ \r\n\t]\,[ \r\n\t]+/g, ",");
                    if (!selectors.match(/^[ \t]*body /)) {
                        selectors = prefix + " " + selectors.replace(/\,/g, ",\n" + prefix + " ");
                    }

                    var modified = leading + selectors + "{";

                    return modified;
                });

                if (ie() && ie() < 10) {
                    if (!window.templateStyleNode) {
                        var head = document.head || document.getElementsByTagName("head")[0];
                        var style = document.createElement("style");
                        style.type = "text/css";

                        if (style.styleSheet) {
                            style.styleSheet.cssText = "";
                        }

                        head.appendChild(style);

                        window.templateStyleNode = style;
                    }

                    if (window.templateStyleNode.styleSheet) {
                        window.templateStyleNode.styleSheet.cssText += "\n" + css
                    } else {
                        window.templateStyleNode.appendChild(document.createTextNode(css));
                    }

                    window.processedStyle[templateName] = true;

                    return "";
                } else {
                    return start + css + end;
                }
            });
        },
        processLocalizationMacros: function (html) {
            if (!window.Messages) return html;
        	return html.replace(/#\{([^\r\n\}]+)\}/g, function (all, one) {
        		var s = Messages[one] || one;
        		return Dom.htmlEncode(s);
        	});
        },
        performAutoBinding: function (container, namingContext) {
            Dom.doOnChildRecursively(container, {
                eval: function(n) {
                    return n.localName == "ui" || (n.namespaceURI == "http://evolus.vn/Namespaces/WebUI/1.0");
                }
            }, function(n) {
                var clazz = n.getAttribute("type");
                if (!clazz) clazz = n.localName;
                if (!clazz) return;

                var f = window[clazz];
                var widget = new f();

                for (var i = 0; i < n.attributes.length; i ++) {
                    var name = n.attributes[i].name;
                    var value = n.attributes[i].value;

                    if (name == "anon-id") {
                        if (namingContext) {
                            namingContext[value] = widget;
                        }
                    } else if (name == "style") {
                        var currentStyle = widget.node().getAttribute("style");
                        if (currentStyle) {
                            currentStyle += value;
                        } else {
                            currentStyle = value;
                        }
                        widget.node().setAttribute("style", currentStyle);
                    } else if (name == "flex") {
                        widget.node().setAttribute("flex", value);
                    } else {
                        widget[name] = value;
                    }
                }

                n.parentNode.replaceChild(widget.node(), n);
                widget.signalOnAttached();
            });
        },
        _processTemplate: function(dolly, namingContext) {
            dolly.removeAttribute("id");
            //dolly.style.display = "block";

            var anonIdToIdMap = {};

            widget.Util.performAutoBinding(dolly, namingContext);

            Dom.doOnChildRecursively(dolly, {
                eval: function(n) {
                    return n.getAttribute && n.getAttribute("anon-id");
                }
            }, function(n) {
                var id = n.getAttribute("anon-id");
                if (namingContext) {
                    namingContext[id] = n;
                }

                var newId = id + widget.random();
                n.setAttribute("id", newId);
                anonIdToIdMap[id] = newId;
                Dom.addClass(n, "AnonId_" + id);
            });
            Dom.doOnChildRecursively(dolly, {
                eval: function(n) {
                    return true;
                }
            }, function(n) {
                if (n.getAttribute) {
                    var href = n.getAttribute("href");
                    if (href && href.match(/^#(.+)$/)) {
                        var id = RegExp.$1;
                        if (anonIdToIdMap[id]) {
                            n.setAttribute("href", "#" + anonIdToIdMap[id]);
                        }
                    }

                    var ffor = n.getAttribute("for");
                    if (ffor && anonIdToIdMap[ffor]) {
                        n.setAttribute("for", anonIdToIdMap[ffor]);
                    }
                }
            });
        },
        buildDOMFromTemplate: function(template, namingContext) {
            template = widget.get(template);
            var dolly = template.cloneNode(true);

            widget.Util._processTemplate(dolly, namingContext);

            return dolly;
        },

        loadTemplate: function(path, callback) {
            if (!callback) return widget.Util.loadTemplateSync(path);

            if (typeof (TEMPLATE_CACHE[path]) != "undefined") {
                if (callback) {
                    callback(TEMPLATE_CACHE[path]);
                    return;
                } else {
                    return TEMPLATE_CACHE[path];
                }
            }

            var task = function(done) {
                var request = new XMLHttpRequest();
                request.onreadystatechange = function() {
                    if (request.readyState == 4) {
                        done();
                        var html = request.responseText;
                        html = widget.Util.processLocalizationMacros(html);
                        TEMPLATE_CACHE[path] = html;
                        callback(html);
                    }
                };
                request.open("GET", widget.STATIC_BASE + path + "?t=" + widget.CACHE_RANDOM, true);
                request.send(null);
            };

            run(task);
        },
        loadTemplateSync: function(path) {
            if (typeof (TEMPLATE_CACHE[path]) != "undefined") {
                return TEMPLATE_CACHE[path];
            }

            var request = new XMLHttpRequest();
            request.open("GET", widget.STATIC_BASE + path + "?t=" + widget.CACHE_RANDOM, false);
            request.send(null);
            var html = request.responseText;
            html = widget.Util.processLocalizationMacros(html);
            TEMPLATE_CACHE[path] = html;

            return html;
        },
        _toTemplateNode: function (path, html, namingContext) {
            if (html) {
                html = html.replace(/<ui:([a-zA-Z0-9]+)/gi, function (all, name) {
                    return "<ui type=\"" + name + "\"";
                });
            }
            var div = document.createElement("div");
            var className = "DynamicTemplate" + widget.random();
            var templateName = path.replace(/[^a-z0-9]+/gi, "_");
            div.innerHTML = widget.Util._processTemplateStyleSheet(html, "." + className, templateName);
            var firstElement = null;
            for (var i = 0; i < div.childNodes.length; i ++) {
                var e = div.childNodes[i];
                if (e && e.nodeType == Node.ELEMENT_NODE) {
                    firstElement = e;
                    break;
                }
            }

            if (firstElement) {
                div = firstElement;
            }

            Dom.addClass(div, className);
            Dom.addClass(div, templateName);

            widget.Util._processTemplate(div, namingContext);

            return div;
        },
        loadTemplateAsNode: function(path, callback, namingContext) {
            widget.Util.loadTemplate(path, function (html) {
                callback(widget.Util._toTemplateNode(path, html, namingContext));
            });
        },
        loadTemplateAsNodeSync: function(path, namingContext) {
            var html = widget.Util.loadTemplateSync(path);
            return widget.Util._toTemplateNode(path, html, namingContext);

        },
        registerGlobalListener: function(listener) {
            if (!widget.globalListeners) widget.globalListeners = [];
            widget.globalListeners.push(listener);
        },
        fireGlobalEvent: function() {
            if (!widget.globalListeners) return;
            var name = arguments[0];
            var args = [];
            for ( var i = 1; i < arguments.length; i++) {
                args.push(arguments[i]);
            }

            for ( var i = 0; i < widget.globalListeners.length; i++) {
                var listener = widget.globalListeners[i];
                if (!listener[name]) continue;
                var f = listener[name];
                f.apply(listener, args);
            }
        },
        createOverlayCover: function (zIndex, opacity, color, onClose) {
            var cover = document.createElement("div");
            document.body.appendChild(cover);
            cover.style.position = "fixed";
            cover.style.top = "0px";
            cover.style.left = "0px";
            cover.style.bottom = "0px";
            cover.style.right = "0px";

            if (opacity) cover.style.opacity = "" + opacity;
            if (zIndex) cover.style.zIndex = "" + zIndex;
            if (color) cover.style.background = color;

            if (onClose) {
                Dom.registerEvent(cover, "click", function () {
                    cover.parentNode.removeChild(cover);
                    onClose();
                });
            }

            return cover;
        },
        createBlankCover: function (onClose) {
            return this.createOverlayCover(widget.Dialog.getTopZIndex(), 0, null, onClose);
        },
        createDarkCover: function (onClose) {
            return this.createOverlayCover(widget.Dialog.getTopZIndex(), 0.3, "#000", onClose);
        },
        popupStack: [],
        positionAsPopup: function (node, anchor, hAlign, vAlign, hPadding, vPadding) {
            if (node.parentNode) node.parentNode.removeChild(node);
            document.body.appendChild(node);
            var w = node.offsetWidth;
            var h = node.offsetHeight;

            var rect = anchor.getBoundingClientRect();
            var aw = rect.width;
            var ah = rect.height;
            var ax = rect.left;
            var ay = rect.top;

            var p = hPadding || 0;

            var x = 0;
            if (hAlign == "left") x = ax - w - p;
            if (hAlign == "left-inside") x = ax + p;
            if (hAlign == "middle" || hAlign == "center") x = ax + aw / 2 - w / 2;
            if (hAlign == "right") x = ax + aw + p;
            if (hAlign == "right-inside") x = ax + aw - w - p;

            p = vPadding || p;

            var y = 0;
            if (vAlign == "top") y = ay - h - p;
            if (vAlign == "top-inside") y = ay + p;
            if (vAlign == "middle" || vAlign == "center") y = ay + ah / 2 - h / 2;
            if (vAlign == "bottom") y = ay + ah + p;
            if (vAlign == "bottom-inside") y = ay + ah - h - p;


            node.style.position = "absolute";
            node.style.left = x + "px";
            node.style.top = y + "px";
            node.style.zIndex = "9999";
            node.style.visibility = "visible";

            widget.Util.popupStack.push(node);
        },
        registerPopopCloseHandler: function () {
            document.body.addEventListener("mousedown", function (event) {
                if (widget.Util.popupStack.length == 0) return;
                var popup = widget.Util.popupStack[widget.Util.popupStack.length - 1];
                var node = Dom.findUpward(event.target, function (n) {
                    return n == popup;
                });
                if (node) return;
                popup.style.visibility = "hidden";
                widget.Util.popupStack.pop();
                event.preventDefault();
            }, false);
        }
    };
}();

var busyIndicator = null;
function initBusyIndicator() {
    if (busyIndicator) return;
    busyIndicator = {};

    busyIndicator.overlay = document.createElement("div");
    document.body.appendChild(busyIndicator.overlay);
    Dom.addClass(busyIndicator.overlay, "Overlay");
    Dom.addClass(busyIndicator.overlay, "BusyOverlay");

    document.body.appendChild(busyIndicator.overlay);
    busyIndicator.overlay.style.display = "none";

    busyIndicator.messageContainer = document.createElement("div");
    document.body.appendChild(busyIndicator.messageContainer);
    busyIndicator.messageContainer.style.visibility = "hidden";

    Dom.addClass(busyIndicator.messageContainer, "BusyMessage");
    var spinner = document.createElement("i");
    busyIndicator.messageContainer.appendChild(spinner);
    Dom.addClass(spinner, "fa fa-spinner fa-spin");

    busyIndicator.message = document.createElement("span");
    Dom.addClass(busyIndicator.message, "Text");
    busyIndicator.messageContainer.appendChild(busyIndicator.message);
    Dom.setInnerText(busyIndicator.message, widget.LOADING);

    var w = Dom.getOffsetWidth(busyIndicator.messageContainer);
    busyIndicator.messageContainer.style.marginLeft = "-" + (w / 2) + "px";
}

var defaultIndicator = {
    count: 0,
    busy: function(message) {
        initBusyIndicator();

        Dom.setInnerText(busyIndicator.message, message || widget.LOADING);
        var w = Dom.getOffsetWidth(busyIndicator.messageContainer);
        busyIndicator.messageContainer.style.marginLeft = "-" + (w / 2) + "px";

        busyIndicator.messageContainer.style.visibility = "visible";
        busyIndicator.overlay.style.display = "block";
        this.count++;
    },
    done: function() {
        this.count--;
        if (this.count <= 0) {
            busyIndicator.messageContainer.style.visibility = "hidden";
            busyIndicator.overlay.style.display = "none";
        }
    }
}
function NodeBusyIndicator(node) {
    this.node = node;
}
NodeBusyIndicator.prototype.busy = function (m) {
    Dom.addClass(this.node, "Busy");
};
NodeBusyIndicator.prototype.done = function (m) {
    Dom.removeClass(this.node, "Busy");
};

function run(task, message, indicator) {
    var i = indicator || defaultIndicator;
    var m = message || null;

    i.busy(m);
    task(function() {
        i.done();
    });
}

window.addEventListener("load", function () {
    window.globalViews = {};
    widget.Util.performAutoBinding(document.body, window.globalViews);
    widget.Util.registerPopopCloseHandler();
}, false);


function BaseWidget() {
    var node = this.buildDOMNode();


    this.__node = node;
    node.__widget = this;

    this.__delegate("addEventListener", "hasAttribute", "getAttribute", "setAttribute", "setAttributeNS", "removeAttribute", "removeAttributeNS", "dispatchEvent");
}
//@abstract BaseWidget.prototype.buildDOMNode = function () {};
BaseWidget.prototype.node = function () {
    return this.__node;
};
BaseWidget.prototype.signalOnAttached = function () {
    this.onAttached();
    this.upgradeMDL(this.__node);
    
    for (name in this) {
        var o = this[name];
        if (o && o instanceof BaseWidget) {
            o.signalOnAttached();
        }
    }
};

BaseWidget.prototype.onAttached = function () { };
Object.defineProperty(BaseWidget.prototype, "ownerDocument", {
    get: function () {
        return this.node().ownerDocument;
    }
});

BaseWidget.prototype.into = function (container) {
    container.appendChild(this.node());
    this.onAttached();
    return this;
};
BaseWidget.prototype.__delegate = function () {
    for (var i = 0; i < arguments.length; i ++) {
        this.__delegateOne(arguments[i]);
    }
};
BaseWidget.prototype.__delegateOne = function (name) {
    var thiz = this;
    this[name] = function () {
        var f = thiz.__node[name];
        var args = [];
        for (var i = 0; i < arguments.length; i ++) {
            args.push(arguments[i]);
        }
        f.apply(thiz.__node, args);
    };
};

function BaseTemplatedWidget() {
    BaseWidget.call(this);
}
__extend(BaseWidget, BaseTemplatedWidget);

BaseTemplatedWidget.prototype.buildDOMNode = function () {
    var path = this.getTemplatePrefix() + this.constructor.name + ".xhtml";
    var node = widget.Util.loadTemplateAsNodeSync(path, this);

    return node;
};
BaseTemplatedWidget.prototype.getTemplatePrefix = function () {
    return "views/";
};
BaseTemplatedWidget.prototype.upgradeMDL = function (node) {
    if (node.className && node.className.match(/^mdl\-.+/)) {
        componentHandler.upgradeElement(node);
        return;
    } else {
        if (node.childNodes) {
            for (var i = 0; i < node.childNodes.length; i ++) {
                this.upgradeMDL(node.childNodes[i]);
            }
        }
    }
    return "views/";
};