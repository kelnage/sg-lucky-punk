// ==UserScript==
// @name         Do You Feel Lucky, Punk?
// @namespace    http://www.steamgifts.com/user/kelnage
// @version      1.6.0
// @description  Calculate the expected number of GAs you should have won based upon the GAs you've entered and the number of users who entered them
// @author       kelnage
// @match        https://www.steamgifts.com/giveaways/entered*
// @grant        none
// @require      http://cdn.plot.ly/plotly-latest.min.js
// @updateURL    https://raw.githubusercontent.com/kelnage/sg-lucky-punk/master/Do%20You%20Feel%20Lucky%2C%20Punk.meta.js
// @downloadURL  https://raw.githubusercontent.com/kelnage/sg-lucky-punk/master/Do%20You%20Feel%20Lucky%2C%20Punk.user.js
// ==/UserScript==
/* jshint -W097 */
'use strict';

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

var WAIT_MILLIS = 500;
var PAGE_LOAD = 300;
var ENTERED_URL = "https://www.steamgifts.com/giveaways/entered/search";
var WINS_URL = "https://www.steamgifts.com/giveaways/won/search";
var BAD_DATES = [{"begin": new Date(2014, 4, 1), "end": new Date(2014, 9, 19)}];

var searchSuffix = (function(q) {
    if(q) {
        return "_" + q.toUpperCase().replace(/[^0-9A-Z]/g, "_");
    }
    return "";
})(qs.q);

// Local storage keys for caching results
var LAST_CACHED_WIN = "PUNK_LAST_CACHED_WINS" + searchSuffix;
var CACHED_WINS = "PUNK_CACHED_WINS" + searchSuffix;
var LAST_CACHED_ENTERED = "PUNK_LAST_CACHED_ENTERED" + searchSuffix;
var CACHED_ENTERED = "PUNK_CACHED_ENTERED" + searchSuffix;
var CACHE_VERSION = "PUNK_CACHE_VERSION" + searchSuffix;

var clearCache = function(evt) {
    if(evt) {
        evt.preventDefault();
    }
    localStorage.setItem(LAST_CACHED_WIN, new Date(0));
    localStorage.setItem(CACHED_WINS, "{}");
    localStorage.setItem(LAST_CACHED_ENTERED, new Date(0));
    localStorage.setItem(CACHED_ENTERED, "{}");
    return false;
};

if(!localStorage.getItem(CACHE_VERSION)) {
    clearCache();
    localStorage.setItem(CACHE_VERSION, "1");
}

// set default cache values
if(!localStorage.getItem(LAST_CACHED_WIN)) {
    localStorage.setItem(LAST_CACHED_WIN, new Date(0));
    localStorage.setItem(CACHED_WINS, "{}");
}
if(!localStorage.getItem(LAST_CACHED_ENTERED)) {
    localStorage.setItem(LAST_CACHED_ENTERED, new Date(0));
    localStorage.setItem(CACHED_ENTERED, "{}");
}

var working = false;
// assumes that there are always 50 GAs on a page
var lastPage = Math.ceil(parseInt($("div.pagination__results").children("strong:last").text().replace(/,/, ""), 10) / 50);

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
    result.setMilliseconds(0);
    return result;
};

var filterBadDates = function(i) {
    for(var i in BAD_DATES) {
        var range = BAD_DATES[i];
        if(this.date >= range.begin && this.date < range.end) {
            return false;
        }
    }
    return true;
};

var dateToDayString = function(date) {
    var day = new Date(date);
    day.setUTCMinutes(0);
    day.setUTCHours(0);
    return day.toISOString().replace(/T/, " ").replace(/\.[0-9]{3}Z/, "");
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
            // ignore GAs that have been deleted
            return $(this).find("p.table__column__deleted").size() === 0;
        })
        .map(function(i, e) {
            var $e = $(e);
            var copies = $e.find("a.table__column__heading").text().match(/\(([0-9,]+) Copies\)/);
            copies = (copies === null ? 1 : parseInt(copies[1].replace(/,/g, ""), 10)); // only multi-GAs have the (X Copies) text in their title, default to 1 copy
            var entries = parseInt($($e.children().get(2)).text().replace(/,/g, ""), 10); // remove number formatting
            var date = parseSteamGiftsTime($($e.find("div:nth-child(2) > p:nth-child(2) > span")).attr("title"));
            var future = $($e.children().get(4)).text() !== "-";
            return {"copies": copies, "entries": entries, "date": date, "value": copies / entries, "future": future};
        })
        .filter(filterBadDates)
        .get();
};

var extractWon = function(input) {
    return $(".table__row-inner-wrap", input)
        .filter(function(i) {
            return $(this).find("div.table__gift-feedback-received > i.fa-check-circle").size() == 1;
        })
        .map(function(i, e) {
            var date = parseSteamGiftsTime($($(e).find("div:nth-child(2) > p:nth-child(2) > span")).attr("title"));
            return {"date": date, "value": 1};
        })
        .filter(filterBadDates)
        .get();
};

var summariseDailyValues = function(giveaways, dailySum, earliest) {
    var maxDate = new Date(0), minDate = new Date();
    giveaways.forEach(function(ga) {
        if(ga.date > maxDate) {
            maxDate = ga.date;
        }
        if(ga.date < minDate) {
            minDate = ga.date;
        }
        if(ga.date > earliest || !earliest) {
            var dayString = dateToDayString(ga.date);
            if(dayString in dailySum) {
                dailySum[dayString] += ga.value;
            } else {
                dailySum[dayString] = ga.value;
            }
        }
    });
    return [minDate, maxDate];
};

var fetchWon = function(dailyWins, page, earliest, callback) {
    $.get(WINS_URL, {"page": page}, function(data) {
        var dateRange = summariseDailyValues(extractWon(data), dailyWins, earliest);
        if(dateRange[1] > new Date(localStorage.getItem(LAST_CACHED_WIN))) {
            localStorage.setItem(LAST_CACHED_WIN, dateRange[1]);
        }
        if($("div.pagination__navigation > a > span:contains('Next')", data).size() === 1 && dateRange[0] > earliest) {
            setTimeout(function() {
                fetchWon(dailyWins, page + 1, earliest, callback);
            }, WAIT_MILLIS);
        } else {
            callback();
        }
    });
};

var fetchEntered = function(dailyEntered, futureEntered, page, earliest, callback) {
    $.get(ENTERED_URL, {"q": qs.q, "page": page}, function(data) {
        var entries = extractEntries(data);
        var old = entries.filter(function(e, i) { return !e.future; });
        var future = entries.filter(function(e, i) { return e.future; });
        var dateRange = summariseDailyValues(old, dailyEntered, earliest);
        summariseDailyValues(future, futureEntered);
        if(dateRange[1] > new Date(localStorage.getItem(LAST_CACHED_ENTERED))) {
            localStorage.setItem(LAST_CACHED_ENTERED, dateRange[1]);
        }
        if($("div.pagination__navigation > a > span:contains('Next')", data).size() === 1 && dateRange[0] > earliest) {
            setTimeout(function() {
                fetchEntered(dailyEntered, futureEntered, page + 1, earliest, callback);
            }, WAIT_MILLIS);
            if(isNaN(lastPage)) {
                $("span#punk_result").text(" Calculating your odds of success now. Please be patient - I've requested " +
                                           page + " page(s) of your entered GAs");
            } else {
                $("span#punk_result").text(" Calculating your odds of success now. Please be patient - this should take another " +
                                           formatTime((lastPage - page) * (WAIT_MILLIS + PAGE_LOAD)));
            }
        } else {
            callback();
        }
    });
};

var sortDateMapAndPlot = function(map, plot, cumulative, start, maxDate, minDate) {
    var smallest = (minDate ? minDate : new Date()), largest = (maxDate ? maxDate : new Date(0)), total = (start ? start : 0);
    largest.setUTCHours(0);
    largest.setUTCMinutes(0);
    largest.setUTCSeconds(0);
    for(var day in map) {
        var test = new Date(day.replace(/ /, "T"));
        if(test < smallest) {
            smallest = test;
        }
        if(test > largest) {
            largest = test;
        }
    }
    smallest.setUTCDate(smallest.getDate() - 1);
    smallest.setUTCSeconds(0);
    plot.x.push(dateToDayString(smallest));
    plot.y.push(0);
    while(smallest < largest) {
        smallest.setDate(smallest.getDate() + 1);
        var dayString = dateToDayString(smallest);
        if(map[dayString]) {
            total += map[dayString];
        }
        plot.x.push(dayString);
        plot.y.push((cumulative ? total : (map[dayString] ? map[dayString] : 0)));
    }
    return {"total": total, "first": smallest, "last": largest};
};

var calculateExpectedTotalValue = function(evt) {
    evt.preventDefault();
    if(!working) {
        working = true;
        if(isNaN(lastPage)) {
            $("span#punk_result").text("Calculating your odds of success now. Please be patient - this could take a little while...");
        } else {
            $("span#punk_result").text(" Calculating your odds of success now. Please be patient - this should take about " +
                                       formatTime(lastPage * (WAIT_MILLIS + PAGE_LOAD)));
        }
        var totalWon = 0, dailySum = JSON.parse(localStorage.getItem(CACHED_ENTERED)), dailyWins = JSON.parse(localStorage.getItem(CACHED_WINS)), futureSum = {},
            expectedWins = {"x": [], "y": [], "type": "bar", "name": "Expected wins"},
            futureWins = {"x": [], "y": [], "type": "bar", "name": "Future wins"},
            actualWins = {"x": [], "y": [], "type": "scatter", "mode": "lines", "name": "Actual wins"};
        // assumes that fetching won GAs will be quicker than fetching entered GAs
        // if searching won GAs works, then could do this also with query
        if(!qs.q) {
            fetchWon(dailyWins, 1, new Date(localStorage.getItem(LAST_CACHED_WIN)), function() {});
        }
        fetchEntered(dailySum, futureSum, 1, new Date(localStorage.getItem(LAST_CACHED_ENTERED)), function() {
            var dailyExpPlot = sortDateMapAndPlot(dailySum, expectedWins, true, null, new Date()), totalExpectedValue = dailyExpPlot.total;
            sortDateMapAndPlot(futureSum, futureWins, true, totalExpectedValue, null, dailyExpPlot.last);
            var dailyWinsPlot = sortDateMapAndPlot(dailyWins, actualWins, true, 0, dailyExpPlot.last);
            totalWon = dailyWinsPlot.total;
            localStorage.setItem(CACHED_WINS, JSON.stringify(dailyWins));
            localStorage.setItem(CACHED_ENTERED, JSON.stringify(dailySum));
            if(qs.q) {
                $("span#punk_result").html(
                    " Based on the finished GAs you have entered for \"" + qs.q + "\", you would expect to have won approximately <strong title=\"" +
                    totalExpectedValue.toFixed(4) + "\">" +
                    totalExpectedValue.toFixed(1) + "</strong> of them. <a href=\"#\" id=\"punk_show_plot\" style=\"font-weight: bold\">Plot it!</a>");
            } else {
                var luckRatio = (totalWon / totalExpectedValue) * 100;
                $("span#punk_result").html(
                    " Based on the finished GAs you have entered, you would expect to have won approximately <strong title=\"" +
                    totalExpectedValue.toFixed(4) + "\">" +
                    totalExpectedValue.toFixed(1) + "</strong> of them but you've actually won <strong>" + totalWon + "</strong>. You've won <strong>" +
                    luckRatio.toFixed(0) + "%</strong> of expected GAs - " +
                    (luckRatio.toFixed(0) >= 100 ? "lucky you" : "unlucky" ) + "! <a href=\"#\" id=\"punk_show_plot\" style=\"font-weight: bold\">Plot it!</a>");
            }
            $("#punk_show_plot").click(function(evt) {
                evt.preventDefault();
                var plots = [expectedWins, futureWins];
                if(!qs.q) {
                    plots.push(actualWins);
                }
                Plotly.newPlot('punk_plot', plots);
                $('#punk_plot').show();
                $("#punk_show_plot").hide();
                return false;
            });
            working = false;
        });
    }
    return false;
};

var $section = $("<div style=\"padding: 0.5em 0\"></div>");
var $btn = $("<a href=\"#\" id=\"punk_button\" style=\"font-weight: bold\">Do You Feel Lucky, Punk?</a>")
    .click(calculateExpectedTotalValue);
var $btnClear = $("<a href=\"#\" id=\"punk_clear\" style=\"font-style: italic; font-size: smaller\">Clear cached results</a>")
    .click(clearCache);
$section.append($btn).append(" ").append($btnClear);
$btn.after("<span id=\"punk_result\"></span>");
$section.append("<div id=\"punk_plot\" style=\"display: none; padding: 0.3em 0; width: " + $('.page__heading').width() + "px; height: 400px;\"></div>");
$(".page__heading").after($section);
