// ==UserScript==
// @name         Do You Feel Lucky, Punk?
// @namespace    http://www.steamgifts.com/user/kelnage
// @version      1.1.1
// @description  Calculate the expected number of GAs you should have won based upon the GAs you've entered and the number of users who entered them
// @author       kelnage
// @match        http://www.steamgifts.com/giveaways/entered*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/kelnage/sg-lucky-punk/master/Do%20You%20Feel%20Lucky%2C%20Punk.meta.js
// @downloadURL  https://raw.githubusercontent.com/kelnage/sg-lucky-punk/master/Do%20You%20Feel%20Lucky%2C%20Punk.user.js
// ==/UserScript==
/* jshint -W097 */
'use strict';

var WAIT_MILLIS = 600;
var URL_FORMAT = "http://www.steamgifts.com/giveaways/entered/search";

var working = false;
// assumes that there are always 50 GAs on a page
var lastPage = Math.ceil(new Number($("div.pagination__results").children("strong:last").text().replace(/,/, "")) / 50);

// taken from StackOverflow: http://stackoverflow.com/a/3855394
var qs = (function(a) {
    if (a == "") {
        return {};
    }
    var b = {};
    for (var i = 0; i < a.length; ++i) {
        var p = a[i].split('=', 2);
        if (p.length == 1) {
            b[p[0]] = "";
        }
        else {
            b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
        }
    }
    return b;
})(window.location.search.substr(1).split('&'));

var parseSteamGiftsTime = function(sg_time) {
    var parts = sg_time.match(/^(.*), ([0-9]+):([0-9]+)(am|pm)$/);
    var day = parts[1], hours = new Number(parts[2]), mins = new Number(parts[3]), period = parts[4];
    var result = new Date();
    switch(day) {
        case "Today":
            break;
        case "Yesterday":
            result.setDate(result.getDate() - 1);
            break;
        case "Tomorrow":
            result.setDate(result.getDate() + 1);
            break;
        default:
            result = new Date(parts[1]);
            break;
    }
    if(period == "am" && hours == 12) {
        result.setHours(0);
    } else if(period == "am") {
        result.setHours(hours);
    } else if(hours == 12) {
        result.setHours(12);
    } else {
        result.setHours(hours + 12);
    }
    result.setMinutes(mins);
    result.setSeconds(0);
    return result;
}

var formatTime = function(millis) {
    millis = new Number(millis);
    if(millis < 1000) {
        return millis.toFixed(0) + "ms";
    } else {
        var seconds = millis / 1000;
        if(seconds < 60) {
            return seconds.toFixed(0) + " seconds";
        } else {
            var minutes = seconds / 60;
            if(minutes < 60) {
                return minutes.toFixed(0) + " minutes";
            } else {
                var hours = minutes / 60;
                return hours.toFixed(1) + " hours";
            }
        }
    }
}

var calculateExpectedPageValue = function(input) {
    return $(".table__row-inner-wrap", input)
        .filter(function(i) {
            // ignore GAs that haven't finished or have been deleted
            return $($(this).children().get(4)).text() == "-" &&
                $(this).find("p.table__column__deleted").size() == 0;
        })
        .map(function(i, e) {
            var $e = $(e);
            var copies = $e.find("a.table__column__heading").text().match(/\(([0-9]+) Copies\)/); 
            copies = (copies == null ? 1 : copies[1]); // only multi-GAs have the (X Copies) text in their title, default to 1 copy
            var entries = $($e.children().get(2)).text().replace(/,/, ""); // remove number formatting
            return copies / entries;
        })
        .get() // turn it into an array
        .reduce(function(x, y) { return x + y }, 0); // sum, default to 0
}

var calculateExpectedTotalValue = function(evt) {
    evt.preventDefault();
    if(!working) {
        working = true;
        $("span#punk_result").text("Calculating your odds of success now. Please be patient - this should take about " + 
                                   formatTime(lastPage * WAIT_MILLIS));
        var totalExpectedValue = 0, finished = 0;
        for(var i = 1; i <= lastPage; i++) {
            setTimeout((function(i) { // using a closure because javascript
                return function() {
                    $.get(URL_FORMAT, {"q": qs["q"], "page": i}, function(data) {
                        var exp = calculateExpectedPageValue(data);
                        totalExpectedValue += exp;
                        finished += 1;
                        if(finished == lastPage) {
                            $("span#punk_result").html(
                                "Based on the finished GAs you have entered, you would expect to have won approximately <strong>" + 
                                new Number(totalExpectedValue).toFixed(1) + "</strong> of them");
                            working = false;
                        } else {
                            $("span#punk_result").text(
                                "Calculating your odds of success now. Please be patient - this should take another " + 
                                formatTime((lastPage - finished) * WAIT_MILLIS));
                        }
                    });
                }
            })(i), (i - 1) * WAIT_MILLIS);
        }
    }
    return false;
}

var $section = $("<div style=\"padding: 0.5em 0\"></div>");
var $btn = $("<a href=\"#\" id=\"punk_button\" style=\"font-weight: bold\">Do You Feel Lucky, Punk?</a>")
    .click(calculateExpectedTotalValue);
$section.append($btn);
$section.append("<span id=\"punk_result\" style=\"padding-left: 0.3em\"></span>");
$(".page__heading").after($section);
