var currentUser = null;
var recentPostId = {};
var hasNotified = false;

function initialize() {
  accessToken = $.cookie("patter2Token");
  var params = getUrlVars();
  var newRoom = params['channel'];
  if (newRoom != null)
  {
    redirect("room.html?channel=" + newRoom);
  }

  if (accessToken == null) {
    authorize();
  }

  $("#main-fail").hide();
  $("#loading-modal").modal({backdrop: 'static',
			     keyboard: false});
  initButtons();
  getUserInfo('me');
}

function getUserInfo(uid) {
  $('#loading-message').html("Fetching User Information");
  var endpoint = "https://alpha-api.app.net/stream/0/users/" + uid;
  jsonPost(endpoint, 'GET', null, null, completeUserInfo, null);
}

function completeUserInfo(response, context) {
  currentUser = response.data;
  $('#loading-message').html("Fetching Channels");
  processChannelList();
}

var processChannelTimer = null;
var channels = [];
var shownChannels = false;

function processChannelList(minId)
{
  if (minId == null)
  {
    channels = [];
  }
  clearTimeout(processChannelTimer);
  var endpoint = "https://alpha-api.app.net/stream/0/channels/"
    + '?include_annotations=1&count=200';
  if (minId != null)
  {
    endpoint += '&before_id=' + minId;
  }
  jsonPost(endpoint, 'GET', null, null, completeChannelList, failChannelList);
  processChannelTimer = setTimeout("processChannelList()", 30*1000);
}

function completeChannelList(response)
{
  if (response.meta.more)
  {
    processChannelList(response.meta.min_id);
  }
  if (response.data != null)
  {
    channels = channels.concat(response.data);
  }
  if (! response.meta.more)
  {
    for (var i = 0; i < channels.length; ++i) {
      channelMembers[channels[i].owner.id] = channels[i].owner;
      for (var j = 0; j < channels[i].writers.user_ids.length; ++j)
      {
	var id = channels[i].writers.user_ids[j];
	if (channelMembers[id] == null) {
	  channelMembers[id] = null;
	}
      }
    }
    getChannelMemberInfo();
  }
}

function failChannelList(response)
{
}

var channelMembers = {};

function getChannelMemberInfo() {
  var ids = Object.keys(channelMembers);
  var needed = [];
  var count = 0;
  for (var i = 0; i < ids.length; ++i) {
    if (channelMembers[ids[i]] == null)
    {
      needed.push(ids[i]);
      ++count;
      if (count >= 200)
      {
	break;
      }
    }
  }
  if (count > 0) {
    var endpoint = "https://alpha-api.app.net/stream/0/users";
    endpoint += "?ids=" + needed.join();
    jsonPost(endpoint, 'GET', null, null, function(response) {
      for (var i = 0; i < response.data.length; ++i) {
	channelMembers[response.data[i].id] = response.data[i];
      }
      getChannelMemberInfo();
    }, null);
  } else {
    var foundPatter = false;
    $('#patter-list').html('<h3 class="muted">Patter Rooms</h3>');
    $('#pm-list').html('<h3 class="muted">Private Messages</h3>');
    for (var i = 0; i < channels.length; ++i) {
      if (channels[i].type == "net.patter-app.room") {
	$('#patter-list').append(renderChannel(channels[i]));
	foundPatter = true;
      } else {
	$('#pm-list').append(renderChannel(channels[i]));
      }
    }
    $(".avatarImg").imagefit();
    if (! foundPatter) {
      $('#patter-list').append('<p><a href="http://patter-app.net/room.html?channel=964" class="btn">Join</a> Welcome to Patter: A public chatroom for those new to the service.</p>');
    }
    if (! shownChannels) {
      $("#loading-modal").modal('hide');
      shownChannels = true;
    }
  }
}

function renderChannel(channel)
{
  var result = null;
  if (channel.type == "net.app.core.pm") {
    result = renderPmChannel(channel);
  } else if (channel.type == "net.patter-app.room") {
    result = renderPatterChannel(channel);
  }
  return result;
}

function renderPmChannel(channel)
{
  var row = jQuery('<div/>');
  var members = findChannelMembers(channel);

  row.addClass('row-fluid');

  row.append($('<div class="span5 offset1"/>').append(renderMembers(members)));
  row.append($('<div class="span6"/>').append(renderThumbs(members)));

  var result = jQuery('<a class="btn btn-large btn-block" href="room.html?channel=' + channel.id + '">');
  if (channel.has_unread) {
    result.addClass("btn-success");
  }
  result.append(row);
  return result;
}

function renderPatterChannel(channel)
{
  var row = jQuery('<div/>');
  var members = findChannelMembers(channel);

  row.addClass('row-fluid');

  row.append($('<div class="span5"/>').append(renderChannelName(channel)));
  row.append($('<div class="span5"/>').append(renderThumbs(members)));
  row.append($('<div class="span2"/>').append(renderStatus(channel)));


  var result = jQuery('<a class="btn btn-large btn-block" href="room.html?channel=' + channel.id + '">');
  if (channel.has_unread) {
    result.addClass("btn-success");
  }
  result.append(row);
  return result;
}

function renderChannelName(channel)
{
  return jQuery('<h4>' + htmlEncode(findChannelName(channel)) + '</h4>');
}

function renderThumbs(members)
{
  var result = jQuery('<div/>');
  for (var i = 0; i < members.length; ++i) {
    result.append('<img class="avatarImg img-rounded" ' +
		  'width="40" height="40" src="' +
		  members[i].avatar + '" alt=""/>');
  }
  return result;
}

function renderMembers(members)
{
  var result = jQuery('<p/>');
  if (members.length > 0) {
    result.append(members[0].user);
    for (var i = 1; i < members.length; ++i) {
      result.append(', ' + members[i].user);
    }
  }
  return result;
}

function findChannelMembers(channel)
{
  var isPatter = (channel.type == 'net.patter-app.room');
  var members = [];
  if (channel.owner.id != currentUser.id || isPatter) {
    members.push({ user: channel.owner.username,
		   avatar: channel.owner.avatar_image.url });
  }
  for (var i = 0; i < channel.writers.user_ids.length; ++i)
  {
    var id = channel.writers.user_ids[i];
    if (channelMembers[id] != null &&
	(id != currentUser.id || isPatter)) {
      members.push({user: channelMembers[id].username,
		    avatar: channelMembers[id].avatar_image.url});
    }
  }
  members.sort(function(left, right) {
    return left.user.localeCompare(right.user);
  });
  return members;
}

function initButtons() {
  initEditRoomModal();
  $('#create-patter-button').on("click", function(event) {
    event.preventDefault();
    updateEditRoom(null, "net.patter-app.room");
    $('#edit-room-modal').modal();
    return false;
  });
  $('#create-pm-button').on("click", function(event) {
    event.preventDefault();
    updateEditRoom(null, "net.app.core.pm");
    $('#edit-room-modal').modal();
    return false;
  });
  $('#logout-button').on("click", logout);
}

function logout(event)
{
  event.preventDefault();
  $.removeCookie("patter2Token");
  redirect("index.html");
  return false;
}

function createPmChannel(names) {
  var text = $('#edit-room-text').val();
  var endpoint = "https://alpha-api.app.net/stream/0/channels/pm/messages";
  var message = { "text": text,
		  "destinations": names };
  jsonPost(endpoint, 'POST', message, null, function(response) {
    if (response.data != null) {
      redirect("room.html?channel=" + response.data.channel_id);
    }  else {
      flagError('edit-room-error-div', "Create PM Request Failed");
    }
  }, null);
}

function createPatterChannel(names) {
  var endpoint = "https://alpha-api.app.net/stream/0/channels";
  var channel = makeNewChannel($('#edit-room-name').val(),
			       $('#edit-room-perm').val(), names);
  channel.type = "net.patter-app.room";

  jsonPost(endpoint, 'POST', channel, null, function(response) {
    if (response.data != null) {
      redirect("room.html?channel=" + response.data.id);
    } else {
      flagError('edit-room-error-div', "Create Patter Room Request Failed");
    }
  }, null);
}
