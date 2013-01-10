var accessToken = null;
var namedUsers = {};

function jsonPost(endpoint, type, data, context, success, failure) {
  var dataStr = null;
  if (data != null)
  {
    dataStr = JSON.stringify(data);
  }
  $.ajax({
    url: endpoint,
    type: type,
    contentType: "application/json",
    data: dataStr,
    dataType: "json",
    beforeSend: setHeader,
    context: context
  }).done(function (data) {
    if (success != null) {
      success(data, this);
    }
  }).fail(function (req, status) {
    if (failure != null) {
      failure(req, this);
    }
    console.log("jsonPost failed: " + status);
    console.dir(req);
    console.dir(req.getAllResponseHeaders());
  });
}

function setHeader(xhr) {
  if (accessToken != null) {
    xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
  }
}


function htmlEncode(value) {
    if (value) {
        return jQuery('<div />').text(value).html();
    } else {
        return '';
    }
}

function htmlDecode(value) {
    if (value) {
        return $('<div />').html(value).text();
    } else {
        return '';
    }
}

function getUrlVars()
{
    var vars = [], hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for(var i = 0; i < hashes.length; i++)
    {
        hash = hashes[i].split('=');
        vars.push(hash[0]);
        vars[hash[0]] = hash[1];
    }
    return vars;
}

function findAnnotation(type, list)
{
  var result = null;
  if (list != null)
  {
    for (var i = 0; i < list.length; ++i)
    {
      if (list[i].type == type)
      {
	result = list[i].value;
	break;
      }
    }
  }
  return result;
}

function broadcastAnnotation(id, url) {
  return {type: "net.patter-app.broadcast",
          value: {id: id,
                  url: url}};
}

function embedImageAnnotation(url, widthIn, heightIn) {
  var width = widthIn;
  if (widthIn == null) {
    width = 300;
  }
  var height = heightIn;
  if (heightIn == null) {
    height = 300;
  }
  return { type: "net.app.core.oembed",
	   value: {
	     version: "1.0",
	     type: "photo",
	     width: width,
	     height: height,
	     url: stripSpaces(url)
	   }};
}

function stripSpaces(str) {
  return str.replace(/ +$/g, "").replace(/^ +/g, "");
}

function textToHtml(text, entitiesIn) {
  var result = "";
  var entities = sortEntities(entitiesIn);
  var anchor = 0;
  for (var i = 0; i < entities.length; ++i) {
    var entity = entities[i].entity;
    result += htmlEncode(text.substr(anchor, entity.pos - anchor));
    if (entities[i].type == "mentions") {
      result += '<a href="http://alpha.app.net/' + entity.name + 
	'" target="_blank">@' + entity.name + '</a>';
    } else if (entities[i].type == "hashtags") {
      result += '<a href="http://alpha.app.net/hashtags/' + entity.name + 
	'" target="_blank">#' + entity.name + '</a>';
    } if (entities[i].type == "links") {
      result += '<a href="' + entity.url + '" target="_blank">' + entity.text +
	'</a>';
    }
    anchor = entity.pos + entity.len;
  }
  result += htmlEncode(text.substr(anchor));
  return result;
}

function sortEntities(entities) {
  var result = [];
  var typeList = ["mentions", "hashtags", "links"];
  for (var i = 0; i < typeList.length; ++i)
  {
    var type = typeList[i];
    for (var j = 0; j < entities[type].length; ++j)
    {
      result.push({pos: entities[type][j].pos,
		   type: type,
		   entity: entities[type][j]});
    }
  }
  result.sort(function (left, right) {
    return left.pos - right.pos;
  });
  return result;
}

function authorize() {
  $.cookie("patterPrevUrl", window.location, { expires: 30, path: "/" });
  redirect("auth.html");
}

function redirect(dest) {
  window.location = dest;
}

function renderStatus(channel)
{
  var locked = (channel.readers.immutable && channel.writers.immutable);
  var lockStatus = "";
  if (locked) {
    lockStatus = '<i class="icon-lock"></i> ';
  }
  var status = '<span class="label">' + lockStatus + 'Private</span>';
  if (channel.readers.public || channel.readers.any_user) {
    status = '<span class="label label-success">' + lockStatus +
      'Public Read</span>';
  }
  if (channel.writers.public || channel.writers.any_user) {
    status = '<span class="label label-success">' + lockStatus +
      'Public</span>';
  }
  return status;
}

function findChannelName(channel)
{
  var name = "PM";
  var settings = findAnnotation("net.patter-app.settings",
				channel.annotations);
  if (settings != null && settings.name != null)
  {
    name = settings.name;
  }
  return name;
}


//-----------------------------------------------------------------------------
// Edit Room Dialog Box
//-----------------------------------------------------------------------------

var editRoomFields = null;
var editRoomChannel = null;
var editRoomType = null;

function initEditRoomModal()
{
  editRoomFields = new UserFields('edit-room');
  $("#edit-room-save").on("click", function(event) {
    event.preventDefault();
    if ($('#edit-room-name').val() == "" &&
	editRoomType == "net.patter-app.room") {
      flagError('edit-room-error-div', "You must specify a name");
    } else if ($('#edit-room-text').val() == "" &&
	       editRoomType == "net.app.core.pm") {
      flagError('edit-room-error-div', "You must compose a message");
    } else {
      disableEditRoom();
      editRoomFields.checkNames(completeEditRoom);
    }
    return false;
  });
  $("#edit-room-perm").on("change", function(event) {
    updatePatterPerm($('#edit-room-perm'), $('#edit-room-perm-label'),
		     editRoomFields);
  });
}

function updateEditRoom(newChannel, newType)
{
  editRoomChannel = newChannel;
  editRoomType = newType;
  var canEdit = true;
  if (editRoomChannel != null) {
    canEdit = canEditChannel(editRoomChannel);
    editRoomType = editRoomChannel.type;
  }

  // Modal Title
  var roomType = "Create ";
  if (editRoomChannel != null && canEdit) {
    roomType = "Edit ";
  } else if (editRoomChannel != null) {
    roomType = "View ";
  }
  if (editRoomType == "net.patter-app.room") {
    roomType += "Patter Room";
  } else if (editRoomType == "net.app.core.pm") {
    roomType += "PM Channel";
  }
  $("#edit-room-type").html(roomType);

  // Modal subtitle
  var ownerText = "";
  if (editRoomChannel != null) {
    ownerText = "Owned by @" + editRoomChannel.owner.username;
  }
  $("#edit-room-owner").html(ownerText);

  $('#edit-room-body').hide();
  if (editRoomChannel == null) {
    if (editRoomType == "net.patter-app.room") {
      $('#edit-room-body').html('Patter rooms may be public or private and the owner can modify permissions after they are created.');
      $('#edit-room-body').show();
    } else if (editRoomType == "net.app.core.pm") {
      $('#edit-room-body').html('Private message channels are always private, and you cannot change their permissions.');
      $('#edit-room-body').show();
    }
  }

  // Set name field
  if (editRoomType == "net.patter-app.room") {
    var name = "";
    if (editRoomChannel != null) {
      name = findChannelName(editRoomChannel);
    }
    $("#edit-room-name").val(name);
    $("#edit-room-name").show();
  } else {
    $("#edit-room-name").hide();
  }

  $("#edit-room-text").val("");
  if (editRoomChannel == null && editRoomType == "net.app.core.pm") {
    $("#edit-room-text").show();
  } else {
    $("#edit-room-text").hide();
  }

  $("#edit-room-perm").removeAttr("disabled");
  if (editRoomType == 'net.app.core.pm') {
    $("#edit-room-perm").attr("disabled", true);
    $("#edit-room-perm").val('private');
  } else if (editRoomChannel != null &&
	     (editRoomChannel.writers.public ||
	      editRoomChannel.writers.any_user)) {
    $('#edit-room-perm').val('public');
  } else if (editRoomChannel != null && 
	     (editRoomChannel.readers.public ||
	      editRoomChannel.readers.any_user)) {
    $('#edit-room-perm').val('public-read');
  } else {
    $('#edit-room-perm').val('private');
  }

  editRoomFields.reset();
  var keys = Object.keys(namedUsers);
  for (var i = 0; i < keys.length; ++i) {
    editRoomFields.addField('@' + keys[i]);
  }
  if (canEdit) {
    editRoomFields.addField();
  }
  updatePatterPerm($('#edit-room-perm'), $('#edit-room-perm-label'),
		   editRoomFields);
  if (canEdit) {
    $("#edit-room-save").show();
    $("#edit-room-cancel").html("Cancel");
    if (editRoomChannel != null && editRoomChannel.writers.immutable) {
      $("#edit-room-perm").attr("disabled", true);
      editRoomFields.disable();
    } else {
      editRoomFields.enable();
    }
    if (editRoomChannel != null && editRoomChannel.readers.immutable) {
      $("#edit-room-perm").attr("disabled", true);
    }
  } else {
    $("#edit-room-save").hide();
    $("#edit-room-cancel").html("Back");
    $("#edit-room-name").attr("disabled", true);
    $("#edit-room-perm").attr("disabled", true);
    editRoomFields.disable();
  }
}

function completeEditRoom(names) {
  if (names != null && names.length == 0 &&
      editRoomType == "net.app.core.pm") {
    flagError('pm-create-fields-error-div', 'You need at least one recipient');
  } else if (names != null) {
    if (editRoomChannel != null) {
      changePatterChannel(editRoomChannel, names);
    } else if (editRoomType == "net.app.core.pm") {
      createPmChannel(names);
    } else if (editRoomType == "net.patter-app.room") {
      createPatterChannel(names);
    }
    $('#edit-room-modal').modal('hide');
  }
  enableEditRoom();
}

function disableEditRoom() {
  $('#edit-room-x').attr('disabled', true);
  $('#edit-room-name').attr('disabled', true);
  $('#edit-room-text').attr('disabled', true);
  $('#edit-room-perm').attr('disabled', true);
  $('#edit-room-cancel').attr('disabled', true);
  $('#edit-room-save').button('loading');
  editRoomFields.disable();
}

function enableEditRoom() {
  $('#edit-room-x').removeAttr('disabled');
  $('#edit-room-name').removeAttr('disabled');
  $('#edit-room-text').removeAttr('disabled');
  $('#edit-room-perm').removeAttr('disabled');
  $('#edit-room-cancel').removeAttr('disabled');
  $('#edit-room-save').button('reset');
  editRoomFields.enable();
}

function canEditChannel(channel) {
  return channel.you_can_edit
    && (channel.type == "net.patter-app.room"
	|| ! channel.writers.immutable
	|| ! channel.readers.immutable);
}

function makeNewChannel(name, perm, members, oldChannel) {
  var channel = { "auto_subscribe": true };
  if (oldChannel == null || ! oldChannel.writers.immutable) {
    var canWrite = (perm == 'public');
    var writers = { "immutable": false,
		    "any_user": canWrite };
    if (! canWrite) {
      writers["user_ids"] = members;
    }
    channel.writers = writers;
  }
  if (oldChannel == null || ! oldChannel.readers.immutable) {
    var canRead = (perm == 'public' || perm == 'public-read');
    var readers = { "immutable": false,
		    "public": canRead };
    channel.readers = readers;
  }
  if (oldChannel == null || oldChannel.type == 'net.patter-app.room') {
    var annotation = { type: "net.patter-app.settings",
		       value: { name: name } };
    channel.annotations = [ annotation ];
  }
  return channel;
}

function updatePatterPerm(perm, label, fields) {
  if (perm.val() == 'public') {
    fields.hide();
  } else {
    fields.show();
  }
  if (perm.val() == "private") {
    label.html("This room is private and only accessible by its members.");
  } else if (perm.val() == "public") {
    label.html("This room is public and anyone may join or view it.");
  } else if (perm.val() == "public-read") {
    label.html("Only members may participate, but anyone may view this room.");
  }
}

function flagError(id, message)
{
  var newAlert = '<div class="alert alert-error">' +
    '<button type="button" class="close" data-dismiss="alert">&times;</button>' +
    '<strong>Error:</strong> ' + message +
    '</div>';
  $('#' + id).html(newAlert);
}

//-----------------------------------------------------------------------------
// UserFields
//-----------------------------------------------------------------------------

function UserFields(prefix) {
  this.prefix = prefix;
  this.moreDiv = $('#' + prefix + '-more-div');

  $('#' + prefix + '-more-button').on("click", null, this, function (event) {
    event.preventDefault();
    event.data.addField();
    return false;
  });
  this.fieldCount = 0;
  this.memberNames = {};
  this.callback = null;

  // Create a new user name field
  this.addField = function(val) {
    var fieldset = jQuery('<fieldset/>');
    var newItem = jQuery('<div id="' + this.prefix + "-wrapper-" +
			 this.fieldCount +
			 '" class="input-append control-group pull-left"/>');
    newItem.append('<input id="' + this.prefix + "-input-" + this.fieldCount +
		   '" class="input" type="text" placeholder="@user">');
    newItem.append('<button tabindex="-1" id="' + this.prefix + "-remove-" +
		   this.fieldCount +
		   '" class="btn btn-danger"><i class="icon-remove"></i></button>');
    fieldset.append(newItem);
    this.moreDiv.before(fieldset);
    if (val != null) {
      $('#' + this.prefix + '-input-' + this.fieldCount).val(val);
    }
    $('#' + this.prefix + '-remove-' + this.fieldCount).on('click', null, { index: this.fieldCount, obj: this }, function(event) {
      event.preventDefault();
      event.data.obj.removeField(event.data.index);
      return false;
    });
    ++this.fieldCount;
  }

  // Remove a new user name field
  this.removeField = function(index) {
    if (index >= 0 && index < this.fieldCount) {
      $('#' + this.prefix + '-wrapper-' + index).remove();
      var vals = [];
      for (var i = index + 1; i < this.fieldCount; ++i)
      {
	vals.push($('#' + this.prefix + '-input-' + i).val());
	$('#' + this.prefix + '-wrapper-' + i).remove();
      }
      this.fieldCount = index;
      for (var i = 0; i < vals.length; ++i)
      {
	this.addField(vals[i]);
      }
    }
  }

  // Check validity of names, mark invalid names, then callback with a
  // list of names or an empty list on failure.
  this.checkNames = function(callback) {
    this.callback = callback;
    this.memberNames = {};
    var foundName = false;
    for (var i = 0; i < this.fieldCount; ++i) {
      var newName = $('#' + this.prefix + '-input-' + i).val();
      if (newName.substr(0, 1) != "@")
      {
	newName = '@' + newName;
      }
      if (newName != "" && newName != "@")
      {
	this.memberNames[newName] = i;
	foundName = true;
      }
    }
    if (foundName)
    {
      var endpoint = "https://alpha-api.app.net/stream/0/users";
      endpoint += "?ids=" + Object.keys(this.memberNames).join();
      jsonPost(endpoint, 'GET', null, this, this.processNames, this.failNames);
    }
    else
    {
      this.callback([]);
    }
  }

  this.failNames = function(response, context)
  {
    flagError(context.prefix + '-error-div',
	      'Could not connect to app.net');
    if (context.callback != null)
    {
      context.callback(callbackArray);
    }
  }

  this.processNames = function(response, context)
  {
    var validNames = {};
    for (var i = 0; i < response.data.length; ++i)
    {
      validNames['@' + response.data[i].username] = 1;
    }
    var keys = Object.keys(context.memberNames);
    var allOk = true;
    for (var i = 0; i < keys.length; ++i)
    {
      var index = context.memberNames[keys[i]];
      $('#' + context.prefix + '-wrapper-' + index).removeClass("error");
      if (validNames[keys[i]] == null)
      {
	allOk = false;
	$('#' + context.prefix + '-wrapper-' + index).addClass("error");
      }
    }
    var callbackArray = null;
    if (allOk)
    {
      callbackArray = keys;
    }
    else
    {
      flagError(context.prefix + '-error-div',
		'Fix Invalid Usernames');
    }
    if (context.callback != null)
    {
      context.callback(callbackArray);
    }
  }

  this.hide = function()
  {
    $('#' + this.prefix + '-more-button').hide();
    $('#' + this.prefix + '-more-div').hide();
    for (var i = 0; i < this.fieldCount; ++i) {
      $('#' + this.prefix + '-wrapper-' + i).hide();
    }
  }

  this.show = function()
  {
    $('#' + this.prefix + '-more-button').show();
    $('#' + this.prefix + '-more-div').show();
    for (var i = 0; i < this.fieldCount; ++i) {
      $('#' + this.prefix + '-wrapper-' + i).show();
    }
  }

  this.disable = function()
  {
    $('#' + this.prefix + '-more-button').hide();
    for (var i = 0; i < this.fieldCount; ++i) {
      $('#' + this.prefix + '-input-' + i).attr("disabled", true);
      $('#' + this.prefix + '-remove-' + i).hide();
    }
  }

  this.enable = function()
  {
    $('#' + this.prefix + '-more-button').show();
    for (var i = 0; i < this.fieldCount; ++i) {
      $('#' + this.prefix + '-input-' + i).attr("disabled", false);
      $('#' + this.prefix + '-remove-' + i).show();
    }
  }

  this.reset = function()
  {
    this.enable();
    while (this.fieldCount > 0) {
      this.removeField(this.fieldCount - 1);
    }
  }
}

//-----------------------------------------------------------------------------
// Fetch Stream
//-----------------------------------------------------------------------------

function FetchStream(newEndpoint, newSuccess, newFailure) {
}
