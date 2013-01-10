// Times in minutes;
var goneTimeout = 10;
var idleTimeout = 3;

var accessToken = null;
var currentUser = null;
var currentChannel = null;
var chatRoom = null;
var userPostTimes = {};
var avatarUrls = {};
var lastUserList = "";
var markerName = null;
var moreEmbedded = false;

//-----------------------------------------------------------------------------
// Initialization functions
//-----------------------------------------------------------------------------

function initialize() {
  accessToken = $.cookie("patter2Token");
  var params = getUrlVars();
  var newRoom = params['channel'];
  initializePatter(newRoom);
}

//function showMessage(

function initializePatter(newRoom) {
  $("#main-fail").hide();
  $("#form-post").hide();
  $("#must-authorize").hide();
  $("#read-only").hide();
  $("#loading-modal").modal({backdrop: 'static',
			     keyboard: false});
  $(window).resize(scrollChatToBottom);
  chatRoom = newRoom;

  initButtons();
  initEmbedModal();
  initEditRoomModal();
  if (accessToken != null) {
    getUserInfo('me');
  } else {
    resetWindow();
  }
}

function getUserInfo(uid) {
  $('#loading-message').html("Fetching User Information");
  var endpoint = "https://alpha-api.app.net/stream/0/users/" + uid;
  jsonPost(endpoint, 'GET', null, null, completeUserInfo, failUserInfo);
}

function completeUserInfo(data, context) {
  currentUser = data.data;
  resetWindow();
}

function failUserInfo(data, context) {
  initFail('User Lookup');
  console.log('User Lookup Failure:');
}

function initFail(message) {
  $("#main-fail").show();
}

function getChannelInfo() {
  $('#loading-message').html("Fetching Channel Information");
  var endpoint = "https://alpha-api.app.net/stream/0/channels/" + chatRoom;
  endpoint += "?include_annotations=1";
  jsonPost(endpoint, 'GET', null, null, completeChannelInfo, failChannelInfo);
}

function completeChannelInfo(data) {
  if (data.data != null)
  {
    currentChannel = data.data;
    namedUsers = {};
    namedUsers[currentChannel.owner.username] = 1;
    userPostTimes[currentChannel.owner.username] = null;
    avatarUrls[currentChannel.owner.username] =
      currentChannel.owner.avatar_image.url;
    getWriterInfo(currentChannel.writers.user_ids);
    updateChannelView();
    processFeed();
  } else {
    authorize();
  }
}

function failChannelInfo(data, context) {
  console.log("Failed to lookup channel:");
  if (accessToken == null) {
    authorize();
  } else {
    redirect("index.html");
  }
}

function getWriterInfo(writers) {
  var endpoint = "https://alpha-api.app.net/stream/0/users";
  endpoint += "?ids=" + writers.join();
  jsonPost(endpoint, 'GET', null, null, completeWriterInfo, failWriterInfo);
}

function completeWriterInfo(response, context) {
  for (var i = 0; i < response.data.length; ++i) {
    namedUsers[response.data[i].username] = 1;
    userPostTimes[response.data[i].username] = null;
    avatarUrls[response.data[i].username] = response.data[i].avatar_image.url;
  }
}

function failWriterInfo(response, context) {
  console.log("Failed to lookup writers:");
}

function initButtons() {
  $("#form-post").on("submit", function (event) {
    event.preventDefault();
    if ($("#main_post").val().length > 0) {
      postMessage($("#main_post").val(), []);
      $("#main_post").val("");
    }
    return false;
  });
  $("#broadcast-button").on("click", function (event) {
    event.preventDefault();
    if ($("#main_post").val().length > 0) {
      broadcastMessage($("#main_post").val());
      $("#main_post").val("");
    }
    return false;
  });
  $("#authorize-button").on("click", function (event) {
    event.preventDefault();
    authorize();
    return false;
  });
  $("#edit-room-button").on("click", function (event) {
    event.preventDefault();
    updateEditRoom(currentChannel, null);
    $('#edit-room-modal').modal();
    return false;
  });
  $("#subscribe-button").on("click", function (event) {
    event.preventDefault();
    toggleSubscribe();
    return false;
  });
  $('#chat-display-row').jfontsize({
    btnMinusClasseId: '#jfontsize-minus',
    btnDefaultClasseId: '#jfontsize-default',
    btnPlusClasseId: '#jfontsize-plus',
    btnMinusMaxHits: 2,
    btnPlusMaxHits: 9,
    sizeChange: 3
  });
  $('#jfontsize-minus').on("click", scrollChatToBottom);
  $('#jfontsize-default').on("click", scrollChatToBottom);
  $('#jfontsize-plus').on("click", scrollChatToBottom);
}

function resetWindow()
{
  clearTimeout(processTimer)
  currentChannel = null;
  namedUsers = {};
  userPostTimes = {};
  avatarUrls = {};
  lastUserList = "";
  if (currentUser != null) {
    namedUsers[currentUser.username] = 1;
    userPostTimes[currentUser.username] = null;
    avatarUrls[currentUser.username] = currentUser.avatar_image.url;
  }

  $("#main_post").val("");
  $("#global-tab-container").empty();
  $("#user-list").empty();

  if (accessToken == null && chatRoom == null) {
    authorize();
  } else if (chatRoom == null) {
    redirect("index.html");
  } else {
    getChannelInfo();
  }
}

//-----------------------------------------------------------------------------
// Update Functions
//-----------------------------------------------------------------------------

var processIsGoBack = false;
var processTimer = null;
var processEarliest = null;
var processLatest = null;
var shownFeed = false;
var moreInChannel = true;

function processFeed()
{
  clearTimeout(processTimer)
  $('#loading-message').html("Fetching Messages From Channel");
  processIsGoBack = false;
  var chatArea = $("#global-tab-container")[0];

  // Should the feed load older messages or newer ones.
  if (chatArea.scrollTop <= chatArea.scrollHeight / 3
      && $("#global-tab-container").children().length > 0
      && moreInChannel) {
    processIsGoBack = true;
  }

  var endpoint = "https://alpha-api.app.net/stream/0/channels/" + chatRoom
    + '/messages?include_annotations=1&count=20';
  if (processIsGoBack && processEarliest != null) {
    endpoint += "&before_id=" + processEarliest;
  }
  if (!processIsGoBack && processLatest != null) {
    endpoint += "&since_id=" + processLatest;
  }
  jsonPost(endpoint, 'GET', null, null, completeFeed, failFeed);
  processTimer = setTimeout("processFeed()", 20000);
}

function completeFeed(data, context)
{
  clearTimeout(processTimer)
  if (processIsGoBack && ! data.meta.more) {
    moreInChannel = false;
  }
  if (data.meta.min_id != null) {
    if (processEarliest == null || data.meta.min_id < processEarliest) {
      processEarliest = data.meta.min_id;
    }
  }
  if (data.meta.max_id != null) {
    if (processLatest == null || data.meta.max_id > processLatest) {
      processLatest = data.meta.max_id;
    }
  }
  updatePatterFeed(data.data, processIsGoBack);
  if (! shownFeed) {
    if (accessToken == null) {
      $("#must-authorize").show();
    } else if (! currentChannel.writers.you) {
      $("#read-only").show();
    } else {
      $("#form-post").show();
    }
    $("#loading-modal").modal('hide');
    shownFeed = true;
    scrollChatToBottom();
  }
  if (data.meta.marker != null) {
    markerName = data.meta.marker.name;
  }
  if (data.meta.max_id != null && data.meta.marker != null
      && (data.meta.marker.id == null
	  || data.meta.max_id > data.meta.marker.id)) {
    changeMarker(data.meta.max_id);
  }
  processTimer = setTimeout("processFeed()", 2000);
}

function failFeed(response, context) {
}

function changeMarker(id) {
  if (markerName != null && id != null) {
    var endpoint = 'https://alpha-api.app.net/stream/0/posts/marker';
    var marker = { id: id, name: markerName };
    jsonPost(endpoint, 'POST', marker);
  }
}

function updateChannelView() {
  var name = findChannelName(currentChannel);
  var status = renderStatus(currentChannel);
  $('#room-name').html('<strong>' + name + '</strong>');
  $('#room-status').html(status);
  if (currentChannel.you_subscribed) {
    $('#subscribe-button').html("Unsubscribe");
  } else {
    $('#subscribe-button').html("Subscribe");
  }
  if (canEditChannel(currentChannel)) {
    $('#edit-room-button').html("Edit Room");
  } else {
    $('#edit-room-button').html("View Room");
  }
}

function updatePatterFeed(data, goBack) {
  var allPosts = jQuery('<div/>');
  for (var i = data.length - 1; i > -1; i--) {
    if (document.getElementById("post|" + data[i].id) == null) {
      var newPost = calculatePost(data[i]);
      if (newPost != null) {
        allPosts.append(newPost);
      }
    }
  }
  addPostsToFeed(allPosts.contents(), goBack);
  updateUsers();
}

function calculatePost(data) {
    var result = null;
    storePostInfo(data);
    var body = calculateBody(data);
    if (body != null) {
      var postClass = 'postRow';
      var timeClass = 'postTimestamp';
      if (currentUser != null) {
        var userMention = new RegExp("@" + currentUser.username + "[^a-zA-Z\-_]");
        if (data.user.username == currentUser.username) {
            postClass = 'myPostRow';
            timeClass = 'myPostTimestamp';
        } else if (userMention.test(body)) {
            postClass = 'postMentionRow';
            timeClass = 'postMentionTimestamp';
        }
      }
        var row = jQuery('<div/>');
        row.addClass('postRowWrap');
        row.attr('id', 'post|' + data.id);

        var post = jQuery('<div/>');
        post.addClass(postClass);

        var authorContainer = jQuery('<div/>');
        authorContainer.addClass('authorContainer');

        if (avatarUrls[data.user.username] != null) {
            var avatar = "<a href='http://alpha.app.net/" + data.user.username + "' target='_blank' class='authorAvatar'><img class='authorAvatarImg' width='23' height='23' src='" + avatarUrls[data.user.username] + "' /></a>"
            authorContainer.append(avatar);
        }

        var author = jQuery('<a/>');
        author.addClass('author');
        author.attr('href', window.location);
        author.attr('id', '@' + data.user.username);
        author.attr('style',
                    'background: ' + makeUserColor('@' + data.user.username) + ';');
        author.text(data.user.username);
        authorContainer.append(author);

        post.append(authorContainer);
        post.append(' ');
        post.append(body);
        row.append(post);

        var timestamp = jQuery('<span/>');
        timestamp.addClass(timeClass);
        timestamp.attr('id', 'easydate');
        timestamp.attr('title', data.created_at);
        row.append(timestamp);
      row.append(jQuery('<div style="clear: both;"/>'));

        $(".broadcastLink", row).prependTo($(".authorContainer", row));
        $(".mention", row).each(function (index, element) {
            element.setAttribute('style',
                               'color: ' + makeUserColor(element.id) + ';');
        });
        result = row;
    }
    return result;
}

function storePostInfo(data) {
    var created = new Date(data.created_at).getTime();
    if (data.data) {
      var old=data;
      data=old.data;
    }
    if (userPostTimes[data.user.username] == null
        || userPostTimes[data.user.username] < created) {
          userPostTimes[data.user.username] = created;
          avatarUrls[data.user.username] = data.user.avatar_image.url;
    }
}

function calculateBody(data) {
  var result = null;
  var broadcastUrl = null;
  var broadcast = findAnnotation("net.patter-app.broadcast", data.annotations);
  if (data.text != null) {
    result = "";
    if (broadcast != null) {
      broadcastUrl = broadcast.url;
      result += ' <a class="broadcastLink" href="' + broadcastUrl +
	'" target="_blank"><span class="broadcastIcon"></a>';
    }
    result += textToHtml(data.text, data.entities);
    var embed = findAnnotation("net.app.core.oembed", data.annotations);
    if (embed != null && embed.type == "photo") {
      var height = embed.height;
      var width = embed.width;
      if (height == null || height > 200) {
	var aspect = 1;
	if (height != null && width != null) {
	  aspect = width*1.0 / height;
	}
	height = 200;
	width = height * aspect;
      }
      
      result += '<br>';
      result += '<div class="embedImageWrapper" style="height: ' + height + 'px;"><a target="_blank" href="' + htmlEncode(embed.url) +
	'"><img class="embedImage" height="' + height + 
	'" width = "' + width + '" src="' + htmlEncode(embed.url) + '"></a></div>';
      moreEmbedded = true;
    }
  }
  return result;
}

function updateUsers() {
    var userList = //'<h4>User List</h4>' +
                  '<ul class="usersList">';
    var goneTime = new Date().getTime() - 1000 * 60 * goneTimeout;
    var idleTime = new Date().getTime() - 1000 * 60 * idleTimeout;
    var keys = Object.keys(userPostTimes);
    keys.sort();
    var i = 0;
    for (; i < keys.length; ++i) {
        var postTime = userPostTimes[keys[i]]
        if ((postTime != null && postTime >= goneTime)
            || namedUsers[keys[i]] != null) {
            var user = htmlEncode(keys[i]);
            var userClass = "idleUser";
            if (currentUser != null && keys[i] == currentUser.username) {
                userClass = "myAccount";
            } else if (postTime != null && postTime >= idleTime) {
                userClass = "activeUser";
            }
            //user="wwwwwwwwwwwwwwwwwwww";
            userList += "<li><a href='http://alpha.app.net/" + user + "' target='_blank' class='userAvatar'><img class='userAvatarImg' width='33' height='33' src='" + avatarUrls[keys[i]] + "' /></a><a id='@" + user + "' href='" + window.location + "' class='"
            + userClass + "' style='"
            + 'color: ' + makeUserColor('@' + user) + ";'>"
            + user + "</a></li>";
        }
    }
    userList += "</ul>";
    if (userList != lastUserList) {
        $("#user-list").html(userList);
        $(".myAccount").on("click", insertUserIntoText);
        $(".activeUser").on("click", insertUserIntoText);
        $(".idleUser").on("click", insertUserIntoText);
        $(".userAvatarImg").imagefit();
        lastUserList = userList;
    }
}

//-----------------------------------------------------------------------------
// Post Functions
//-----------------------------------------------------------------------------

function postMessage(messageString, annotations, links) {
  var post = {
    text: messageString,
    annotations: annotations
  };
  if (links != null) {
    post.entities = { links: links };
  }
  var endpoint = "https://alpha-api.app.net/stream/0/channels/" + chatRoom +
    "/messages";
  endpoint += "?include_annotations=1";
  jsonPost(endpoint, 'POST', post, null, completePostMessage, failPostMessage);
}

function completePostMessage(response) {
  if (response.data != null) {
    changeMarker(response.data.id);
    updatePatterFeed([response.data], false);
    scrollChatToBottom();
  }
}

function failPostMessage(response) {
}

function broadcastMessage(messageString) {
  var post = {
    text: messageString,
    annotations: [{type: "net.app.core.crosspost",
		   value: { canonical_url: "http://patter-app.net/room.html?channel=" + chatRoom }}]
  };
  var endpoint = "https://alpha-api.app.net/stream/0/posts";
  endpoint += "?include_annotations=1";
  jsonPost(endpoint, 'POST', post, { message: messageString },
	   completeBroadcastMessage, failBroadcastMessage);
}

function completeBroadcastMessage(response, context) {
  if (response.data != null) {
    var broadcast = broadcastAnnotation(response.data.id,
					 response.data.canonical_url);
    postMessage(context.message, [broadcast]);
  }
}

function failBroadcastMessage(response) {
}

function toggleSubscribe() {
  var endpoint = "https://alpha-api.app.net/stream/0/channels/" + chatRoom +
    "/subscribe?include_annotations=1";
  var method = 'DELETE';
  if (! currentChannel.you_subscribed) {
    method = 'POST';
  }
  jsonPost(endpoint, method, null, null, completeToggleSubscribe,
	   failToggleSubscribe);
}

function completeToggleSubscribe(response) {
  if (response.data != null) {
    currentChannel = response.data;
    updateChannelView();
  }
}

function failToggleSubscribe(response) {
}

//-----------------------------------------------------------------------------
// Utility functions
//-----------------------------------------------------------------------------

function addPostsToFeed(posts, addBefore) {
    if (posts != null) {
        var chatArea = document.getElementById("global-tab-container");
        var oldHeight = chatArea.scrollHeight;
        var oldClient = chatArea.clientHeight;
        var oldTop = chatArea.scrollTop;
        if (addBefore) {
            $("#global-tab-container").prepend(posts);
            formatTimestamps();
            chatArea.scrollTop = oldTop + chatArea.scrollHeight - oldHeight;
        } else {
            $(".mention", posts).on("click", insertUserIntoText);
            $(".author", posts).on("click", insertUserIntoText);
            $("#global-tab-container").append(posts);
            formatTimestamps();
            var oldBottom = Math.max(oldHeight, oldClient) - oldClient;
            if (oldTop == oldBottom) {
                chatArea.scrollTop = Math.max(chatArea.scrollHeight,
                                  chatArea.clientHeight)
                    - chatArea.clientHeight;
            }
            if (oldHeight != chatArea.scrollHeight) {
                $.titleAlert("New Message", {
                    duration: 10000,
                    interval: 1000,
                    requireBlur: true
                });
            }
        }
    }
  if (moreEmbedded) {
    $(".embedImage").imagefit();
  }
}

function scrollChatToBottom()
{
  var chatArea = document.getElementById("global-tab-container");
  chatArea.scrollTop = Math.max(chatArea.scrollHeight,
                                chatArea.clientHeight)
    - chatArea.clientHeight;
}

function insertUserIntoText(event) {
  event.preventDefault();
    var user = event.target.id;
    insertText(user);
  return false;
}

function insertText(user) {
    var textBox = $("#main_post");
    var cursor = textBox.caret().start;
    var text = textBox.val();
    var before = text.substring(0, cursor);
    var after = text.substring(cursor);
    textBox.focus();
    textBox.val(before + user + ' ' + after);
    textBox.caret(cursor + user.length + 1, cursor + user.length + 1);
}

function formatTimestamps() {
    $("[id=easydate]").easydate({
        locale: {
            "future_format": "%s %t",
            "past_format": "%t %s",
            "second": "s",
            "seconds": "s",
            "minute": "m",
            "minutes": "m",
            "hour": "h",
            "hours": "h",
            "day": "day",
            "days": "days",
            "week": "week",
            "weeks": "weeks",
            "month": "month",
            "months": "months",
            "year": "year",
            "years": "years",
            "yesterday": "yesterday",
            "tomorrow": "tomorrow",
            "now": "now",
            "ago": " ",
            "in": "in"
        }
    });
}

function makeUserColor(user) {
    var hash = getHash(user);
    var color = (hash & 0x007f7f7f).toString(16);
    while (color.length < 6) {
      color = '0' + color;
    }
    return "#" + color;
}

function getHash(str) {
    var hash = 0;
    if (str.length == 0) return hash;
    var i = 0;
    for (; i < str.length; i++) {
        var char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
};

//-----------------------------------------------------------------------------
// Embed Dialog Box
//-----------------------------------------------------------------------------

var embedImage = null;
var embedImageLoaded = false;
var oldEmbedUrl = null;

function initEmbedModal()
{
  $("#embed-button").on("click", function(event) {
    event.preventDefault();
    $("#embed-post-text").val("")
    $("#embed-post-url").val("")
    $("#embed-post-preview").hide();
    $("#embed-post-preview-placeholder").show();
    $("#embed-post-preview-invalid").hide();
    $("#embed-send-button").attr("disabled", true);
    embedImageLoaded = false;
    updateEmbedSend();
    $("#embedModal").modal();
    return false;
  });
  $("#embed-send-button").on("click", function(event) {
    var url = stripSpaces($("#embed-post-url").val());
    var embed = embedImageAnnotation(url, embedImage[0].width,
				     embedImage[0].height);
    var message = $("#embed-post-text").val() + " Link";
    var link = { text: "Link",
		 url: url,
		 pos: message.length - 4,
		 len: 4 };

    postMessage(message, [embed], [link]);
  });
  $("#embed-post-text").bind("propertychange keyup input paste",
			     changeEmbedText);
  $("#embed-post-url").bind("propertychange keyup input paste",
			    changeEmbedUrl);
  embedImage = jQuery('<img/>');
  embedImage.imagesLoaded(completeEmbedImage);
}

function changeEmbedText(event)
{
  updateEmbedSend();
}

function changeEmbedUrl(event)
{
  var url = $("#embed-post-url").val();
  if (url != oldEmbedUrl && url != "") {
    oldEmbedUrl = url;
    embedImageLoaded = false;
    embedImage.attr("src", url);
    embedImage.imagesLoaded(completeEmbedImage);
    $("#embed-post-preview-updating").show();
    $("#embed-post-preview").attr("src", url);
    $("#embed-post-preview").imagefit();
    $("#embed-post-preview").hide();
    $("#embed-post-preview-placeholder").show();
    updateEmbedSend();
  } else if (url == "") {
    $("#embed-post-preview-invalid").hide();    
  }
}

function completeEmbedImage(images, working, broken)
{
  $("#embed-post-preview-updating").hide();
  if (working.length > 0) {
    if (! embedImageLoaded) {
      $("#embed-post-preview-invalid").hide();
      $("#embed-post-preview-placeholder").hide();
      $("#embed-post-preview").show();
    }
    embedImageLoaded = true;
  } else {
    $("#embed-post-preview-invalid").show();
    if (embedImageLoaded) {
      $("#embed-post-preview").hide();
      $("#embed-post-preview-placeholder").show();
    }
    embedImageLoaded = false;
  }
  updateEmbedSend();
}

function updateEmbedSend()
{
  if (! embedImageLoaded
      || $("#embed-post-url").val() == ""
      || $("#embed-post-text").val() == "")
  {
    $("#embed-send-button").attr("disabled", true);
  } else {
    $("#embed-send-button").removeAttr("disabled");
  }
}

function changePatterChannel(oldChannel, names) {
  if (names != null) {
    var endpoint = "https://alpha-api.app.net/stream/0/channels/" + chatRoom;
    endpoint += "?include_annotations=1";
    var channel = makeNewChannel($('#edit-room-name').val(),
				 $('#edit-room-perm').val(), names,
				 oldChannel);
    jsonPost(endpoint, 'PUT', channel, null, completeChannelInfo, null);
    $('#edit-room-modal').modal('hide');
  }
  enableEditRoom();
}

var mentionRegex = /(@[a-zA-Z0-9\-_]+)\b/g;

var urlRegex = /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/g;