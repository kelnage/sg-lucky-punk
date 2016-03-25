// ==UserScript==
// @name         Do You Feel Lucky, Punk?
// @namespace    http://www.steamgifts.com/user/kelnage
// @version      1.2.1
// @description  Calculate the expected number of GAs you should have won based upon the GAs you've entered and the number of users who entered them
// @author       kelnage
// @match        http://www.steamgifts.com/giveaways/entered*
// @grant        none
// @require      http://cdn.plot.ly/plotly-latest.min.js
// @updateURL    https://raw.githubusercontent.com/kelnage/sg-lucky-punk/master/Do%20You%20Feel%20Lucky%2C%20Punk.meta.js
// @downloadURL  https://raw.githubusercontent.com/kelnage/sg-lucky-punk/master/Do%20You%20Feel%20Lucky%2C%20Punk.user.js
// ==/UserScript==
/* jshint -W097 */
'use strict';

var WAIT_MILLIS = 600;
var URL_FORMAT = "http://www.steamgifts.com/giveaways/entered/search";

var working = false;
// assumes that there are always 50 GAs on a page
var lastPage = Math.ceil(parseInt($("div.pagination__results").children("strong:last").text().replace(/,/, ""), 10) / 50);

// taken from StackOverflow: http://stackoverflow.com/a/3855394
var qs = (function(a) {
    if (a === "") {
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
    var day = parts[1], hours = parseInt(parts[2], 10), mins = parseInt(parts[3], 10), period = parts[4];
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
};

var formatTime = function(millis) {
    millis = parseInt(millis, 10);
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
};

var extractEntries = function(input) {
    return $(".table__row-inner-wrap", input)
        .filter(function(i) {
            // ignore GAs that haven't finished or have been deleted
            return $($(this).children().get(4)).text() == "-" &&
                $(this).find("p.table__column__deleted").size() === 0;
        })
        .map(function(i, e) {
            var $e = $(e);
            var copies = $e.find("a.table__column__heading").text().match(/\(([0-9]+) Copies\)/); 
            copies = (copies === null ? 1 : parseInt(copies[1], 10)); // only multi-GAs have the (X Copies) text in their title, default to 1 copy
            var entries = parseInt($($e.children().get(2)).text().replace(/,/, ""), 10); // remove number formatting
            var date = parseSteamGiftsTime($($e.find("div:nth-child(2) > p:nth-child(2) > span")).attr("title"));
            return {"copies": copies, "entries": entries, "date": date};
        })
        .get();
};

var calculateExpectedPageValue = function(entries) {
    return entries.map(function(entry) { return entry.copies / entry.entries; })
        .reduce(function(x, y) { return x + y; }, 0); // sum, default to 0
};

var addEntriesToPlot = function(entries, plot) {
    entries.forEach(function(entry) {
        plot.x.push(entry.date.toISOString().replace(/T/, " ").replace(/\.[0-9]{3}Z/, ""));
        plot.y.push(entry.copies / entry.entries);
    });
};

var summariseDailyEntries = function(entries, dailySum) {
    entries.forEach(function(entry) {
        var day = new Date(entry.date);
        day.setMinutes(0);
        day.setHours(0);
        var dayString = day.toISOString().replace(/T/, " ").replace(/\.[0-9]{3}Z/, "");
        if(dayString in dailySum) {
            dailySum[dayString] += entry.copies / entry.entries;
        } else {
            dailySum[dayString] = entry.copies / entry.entries;
        }
    });
};

var calculateExpectedTotalValue = function(evt) {
    evt.preventDefault();
    if(!working) {
        working = true;
        $("span#punk_result").text("Calculating your odds of success now. Please be patient - this should take about " + 
                                   formatTime(lastPage * WAIT_MILLIS));
        var totalExpectedValue = 0, finished = 0, plot = {"x": [], "y": [], "type": "bar"}, dailySum = {};
        for(var i = 1; i <= lastPage; i++) {
            setTimeout((function(i) { // using a closure because javascript
                return function() {
                    $.get(URL_FORMAT, {"q": qs.q, "page": i}, function(data) {
                        var entries = extractEntries(data),
                            exp = calculateExpectedPageValue(entries);
                        // addEntriesToPlot(entries, plot);
                        summariseDailyEntries(entries, dailySum);
                        totalExpectedValue += exp;
                        finished += 1;
                        if(finished == lastPage) {
                            $("span#punk_result").html(
                                "Based on the finished GAs you have entered, you would expect to have won approximately <strong title=\"" +
                                totalExpectedValue.toFixed(4) + "\">" + 
                                totalExpectedValue.toFixed(1) + "</strong> of them. <a href=\"#\" id=\"punk_show_plot\" style=\"font-weight: bold\">Plot it!</a>");
                            $("#punk_show_plot").click(function(evt) {
                                evt.preventDefault();
                                var orderedExpectations = [];
                                for(var day in dailySum) {
                                    orderedExpectations.push({"day": day, "expect": dailySum[day]});
                                }
                                // ensure ordering by day - possibly not necessary, but best to check anyway
                                orderedExpectations.sort(function(a, b) { return (a.day < b.day ? -1 : (a.day > b.day ? 1 : 0)); });
                                var sum = 0;
                                for(var i in orderedExpectations) {
                                    var dailyExpectation = orderedExpectations[i];
                                    sum += dailyExpectation.expect;
                                    plot.x.push(dailyExpectation.day);
                                    plot.y.push(sum);
                                }
                                Plotly.newPlot('punk_plot', new Array(plot));
                                $('#punk_plot').show();
                                $("#punk_show_plot").hide();
                                return false;
                            });
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
};

var $section = $("<div style=\"padding: 0.5em 0\"></div>");
var $btn = $("<a href=\"#\" id=\"punk_button\" style=\"font-weight: bold\">Do You Feel Lucky, Punk?</a>")
    .click(calculateExpectedTotalValue);
$section.append($btn);
$section.append("<span id=\"punk_result\" style=\"padding-left: 0.3em\"></span>");
$section.append("<div id=\"punk_plot\" style=\"display: none; padding: 0.3em 0; width: " + $('.page__heading').width() + "px; height: 400px;\"></div>")
$(".page__heading").after($section);
