// ==UserScript==
// @name         Do You Feel Lucky, Punk?
// @namespace    http://www.steamgifts.com/user/kelnage
// @version      1.4.0
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

var WAIT_MILLIS = 500;
var PAGE_LOAD = 300;
var ENTERED_URL = "http://www.steamgifts.com/giveaways/entered/search";
var WINS_URL = "http://www.steamgifts.com/giveaways/won/search";
var BAD_DATES = [{"begin": new Date(2014, 5, 1), "end": new Date(2014, 9, 19)}];

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

var filterBadDates = function(giveaway) {
    for(var i in BAD_DATES) {
        var range = BAD_DATES[i];
        if(giveaway.date >= range.begin && giveaway.date < range.end) {
            return false;
        }
    }
    return true;
}

var dateToDayString = function(date) {
    var day = new Date(date);
    day.setMinutes(0);
    day.setHours(0);
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
            return {"copies": copies, "entries": entries, "date": date, "value": copies / entries};
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

var summariseDailyValues = function(giveaways, dailySum) {
    giveaways.forEach(function(ga) {
        var dayString = dateToDayString(ga.date);
        if(dayString in dailySum) {
            dailySum[dayString] += ga.value;
        } else {
            dailySum[dayString] = ga.value;
        }
    });
};

var fetchWon = function(dailyWins, page, callback) {
    $.get(WINS_URL, {"page": page}, function(data) {
        summariseDailyValues(extractWon(data), dailyWins);
        if($("div.pagination__navigation > a > span:contains('Next')", data).size() === 1) {
            setTimeout(function() {
                fetchWon(dailyWins, page + 1, callback);
            }, WAIT_MILLIS);
        } else {
            callback();
        }
    });
};

var fetchEntered = function(dailyEntered, page, callback) {
    $.get(ENTERED_URL, {"q": qs.q, "page": page}, function(data) {
        summariseDailyValues(extractEntries(data), dailyEntered);
        if($("div.pagination__navigation > a > span:contains('Next')", data).size() === 1) {
            setTimeout(function() {
                fetchEntered(dailyEntered, page + 1, callback);
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

var sortDateMapAndPlot = function(map, plot, cumulative) {
    var list = [], total = 0;
    for(var day in map) {
        list.push([day, map[day]]);
    }
    list.sort(function(a, b) { return (a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0)); });
    for(var i in list) {
        total += list[i][1];
        plot.x.push(list[i][0]);
        plot.y.push((cumulative ? total : list[i][1]));
    }
    return total;
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
        var totalWon = 0, dailySum = {}, dailyWins = {},
            expectedWins = {"x": [], "y": [], "type": "bar", "name": "Expected wins"},
            actualWins = {"x": [], "y": [], "type": "scatter", "name": "Actual wins"};
        // assumes that fetching won GAs will be quicker than fetching entered GAs
        // if searching won GAs works, then could do this also with query
        if(!qs.q) {
            fetchWon(dailyWins, 1, function() {
                totalWon = sortDateMapAndPlot(dailyWins, actualWins, true);
            });
        }
        fetchEntered(dailySum, 1, function() {
            var totalExpectedValue = sortDateMapAndPlot(dailySum, expectedWins, true);
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
                    totalExpectedValue.toFixed(1) + "</strong> of them. You've won <strong>" + luckRatio.toFixed(0) + "%</strong> of expected GAs - " +
                    (luckRatio.toFixed(0) >= 100 ? "lucky you" : "unlucky" ) + "! <a href=\"#\" id=\"punk_show_plot\" style=\"font-weight: bold\">Plot it!</a>");
            }
            $("#punk_show_plot").click(function(evt) {
                evt.preventDefault();
                var plots = [expectedWins];
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
$section.append($btn);
$section.append("<span id=\"punk_result\"></span>");
$section.append("<div id=\"punk_plot\" style=\"display: none; padding: 0.3em 0; width: " + $('.page__heading').width() + "px; height: 400px;\"></div>")
$(".page__heading").after($section);
