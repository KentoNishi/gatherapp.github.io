const functions = require(`firebase-functions`);
const admin = require(`firebase-admin`);
const webpush = require("web-push");
const keys = {
	GCMAPIKey: "AAAAK51wxvE:APA91bHbG2pKnltu9PF2vwMSrS9Ev3bTPzufjeeSUwuCm5OI2nXK93XSyxCEfPE20kbJnMTsR3ajxCsBEg2c4BBgY7hz_Tj_2pClHHlLXGsFepvZKM27WPdOthGqfAQCyU1x3aPibkhc02uj_1snanDcbw0d6GNRqw",
	publicKey: 'BHEaekpS-pAfp4pYeqyJHw6cBmhlxx9bxBHjowhsxyDcuYR-ipUrWT9wAf_AP-q_mgGSwQryLaPMpyhcqByDyqo',
	privateKey: 'l7firirlNjF1iVi9ZvCisoJG5D8QAO5kCWP8NDuYeOo',
	subject: "mailto:kento24gs@outlook.com"
};
admin.initializeApp();
exports.sendNotification = functions.database.ref(`/users/{uid}/feed/{id}/`).onWrite((change, context) => {
    let uid = context.params.uid;
    let id = context.params.id;
    let fireDB = change.after.ref.root;
    return fireDB.child(`/users/${uid}/subs`).once(`value`).then(subs => {
    	webpush.setGCMAPIKey(keys.GCMAPIKey);
    	webpush.setVapidDetails(keys.subject,keys.publicKey,keys.privateKey);
    	return fireDB.child(`/users/${uid}/feed/${id}/`).once(`value`).then(payload => {
    		if(payload.val()!==null){
    			var returns=[];
    			subs.forEach(list=>{
    				var sub=list.val();
    				sub.keys.auth=list.key;
	    			returns.push(webpush.sendNotification(sub,JSON.stringify(payload.val())).catch(error=>{
	    				return fireDB.child(`/users/${uid}/subs/`+list.key).remove();
	    			}));
    			});
    			return Promise.all(returns).then(function(){
    				var load={[payload.val().tag.split("/").length===2?payload.val().tag.split("/")[1]:"info"]:0};
    				return fireDB.child(`/users/${uid}/gatherups/`+payload.val().tag.split("/")[0]).update(load);
    			});
			}else{
				return Promise.resolve();
			}
		});
	}).then(function(){
		return fireDB.child(`users/${uid}/feed/${id}`).remove();
	});
});

exports.detectLeave = functions.database.ref(`/users/{uid}/gatherups/{id}`).onDelete((change, context) => {
    let uid = context.params.uid;
    let id = context.params.id;
    let fireDB = admin.database().ref("/");
    return fireDB.child(`/gatherups/${id}/members/${uid}`).remove();
});

exports.sendBoardFeed = functions.database.ref(`/gatherups/{id}/board/{push}/`).onWrite((change, context) => {
    let id = context.params.id;
    let fireDB = change.after.ref.root;
    let push=context.params.push;
    return fireDB.child(`/gatherups/${id}/board/${push}`).once(`value`).then(post => {
	    return fireDB.child(`/gatherups/${id}/info`).once(`value`).then(info => {
		    if(post.val()!==undefined&&post.val()!==null&&post.val().content!==undefined&&post.val().content!==null&&post.val().author!==undefined&&post.val().author!==null){
		    	return fireDB.child(`/gatherups/${id}/members`).once(`value`).then(people => {
		    		var returns=[];
		    		people.forEach(person=>{
		    			if(person.key!==post.val().author){
			    			returns.push(fireDB.child(`/users/${(post.val().author)}/info`).once(`value`).then(user => {
			    				return fireDB.child("users/"+person.key+"/feed").push({title:info.val().title+" - New Post",content:(user.val()!==null&&user.val()!==undefined?user.val().name:"Unknown User")+" said: "+post.val().content,tag:id+"/board"})
			    			}));
		    			}else{
		    				returns.push(Promise.resolve());
		    			}
		    		});
		    		return Promise.all(returns);
	    		});
		    }else{
				return Promise.resolve();
		    }
	    });
	});
});


exports.sendGroup = functions.database.ref(`/gatherups/{id}/info/`).onWrite((change, context) => {
    let id = context.params.id;
    let fireDB = change.after.ref.root;
    if(change.after.val()!==null){
	    return fireDB.child(`/gatherups/${id}/members/`).once(`value`).then(members => {
	    	var returns=[];
	    	members.forEach(member=>{
	    		var uid=member.key;
	    		var edits=difference(change.before.val(),change.after.val());
	    		edits.forEach(edit=>{
		    		if(edit==="title"||edit==="date"||edit==="location"){
		    			if(context.auth!==undefined&&context.auth.uid!==null&&uid!==context.auth.uid){
				    		returns.push(fireDB.child(`/users/${uid}/feed/`).push().update({
				    			title:change.before.val().title+" - Edited",
				    			content:"Event "+edit.replace("date","time")+(edit!=="date"?"":" was")+" changed"+(edit!=="date"?(" to "+(edit!=="location"?change.after.val()[edit]:(change.after.val().location!==null?(change.after.val().location.name+", "+change.after.val().location.formatted_address.split(",").slice(1,change.after.val().location.formatted_address.split(",").length-2).join(",")):"an unknown location"))):"")+".",
				    			tag:id
							}));
						}else{
							returns.push(Promise.resolve());
						}
					}else{
						returns.push(Promise.resolve());
					}
				});
	    	});
	    	return Promise.all(returns);
		});
	}else{
    	return Promise.resolve();
	}
});

function difference(o1, o2) {
	var returns=[];
	if(o1!==null&&o2!==null){
		if(o1.title!==o2.title){
			returns.push("title");
		}if(o1.date!==o2.date){
			returns.push("date");
		}if(JSON.stringify(o1.location)!==JSON.stringify(o2.location)){
			returns.push("location");
		}
	}
	return returns;
}

exports.toggleGroup = functions.database.ref(`/gatherups/{id}/members/{uid}/`).onWrite((change, context) => {
    let uid = context.params.uid;
    let id = context.params.id;
    let fireDB = change.after.ref.root;
	return fireDB.child(`/gatherups/${id}/info/`).once(`value`).then(value => {
		if(value.val()!==null){
    		var date=value.val().date;
    		if(date!==null&&new Date(new Date(date).getTime()-(change.after.val()*1000*60)).getTime()>new Date().getTime()){
    			var time=Math.ceil((new Date(date).getTime()-change.before.val()*1000*60)/(60*1000)).toString();
			    return fireDB.child(`/notifications/${time}/${id}/${uid}`).remove().then(function(){
			    	time=Math.ceil((new Date(date).getTime()-change.after.val()*1000*60)/(60*1000)).toString();
			    	if(change.after.val()!==null&&change.after.val()>0){
				    	return fireDB.child(`/notifications/${time}/${id}/`).update({
				    		[uid]:change.after.val()
				   		});
			   		}else{	
						return fireDB.child(`/gatherups/${id}/members/`).once(`value`).then(members => {
							if(members.val()===null){
								return fireDB.child(`/gatherups/${id}/`).remove();
							}else{
								return Promise.resolve();
							}
						});
			   		}
			    });
    		}else{
				return fireDB.child(`/gatherups/${id}/members/`).once(`value`).then(members => {
					if(members.val()===null){
						return fireDB.child(`/gatherups/${id}/`).remove();
					}else{
						return Promise.resolve();
					}
				});
    		}
		}else{
			return fireDB.child(`/users/${uid}/gatherups/${id}/`).remove().then(function(){
				return fireDB.child(`/gatherups/${id}/members/${uid}/`).remove();
			});
		}
	}).then(function(){
		return fireDB.child(`/users/${uid}/gatherups/${id}`).once("value",userval=>{
			if(((userval.val()!==null&&userval.val()!==undefined)?1:null)!==(change.after.val()!==null?(change.after.val()===0?0:1):null)){
				return fireDB.child(`/users/${uid}/gatherups/`+id).update({
    				status:(change.after.val()!==null?(change.after.val()===0?0:1):null)
   				});
   			}else{
   				return Promise.resolve();
   			}
   		});
	});
});

exports.countMembersCrseate = functions.database.ref(`/gatherups/{id}/members/{uid}`).onCreate((change, context) => {
	let fireDB=admin.database().ref("/");
	let id=context.params.id;
	return fireDB.child(`/gatherups/${id}/members`).once("value").then(after=>{
		var members=after.val();
		var number=Object.keys(members).length;
		return fireDB.child(`/gatherups/${id}/info`).update({
			people:number
		});	
	});
});

exports.countMembers = functions.database.ref(`/gatherups/{id}/members/{uid}`).onDelete((change, context) => {
	let fireDB=admin.database().ref("/");
	let id=context.params.id;
	return fireDB.child(`/gatherups/${id}/members`).once("value").then(after=>{
		if(after.val()!==null){
			var members=after.val();
			var number=Object.keys(members).length;
			return fireDB.child(`/gatherups/${id}/info`).update({
				people:number
			});	
		}else{
			return Promise.resolve();
		}
	});
});

exports.markAsComplete = functions.database.ref(`/gatherups/{id}/info/date/`).onWrite((change, context) => {
	let fireDB=change.after.ref.root;
	let id=context.params.id;
	let date=change.after.val();
	return fireDB.child(`/gatherups/${id}/info/`).once("value").then(info=>{
		if(date!==undefined&&date!==null&&new Date(date+((info.val().duration*60*1000)||0)).getTime()<=new Date().getTime()){
			return fireDB.child(`/gatherups/${id}/members`).once("value").then(members=>{
				var returns=[];
				members.forEach(member=>{
					returns.push(fireDB.child(`/users/${(member.key)}/gatherups/${id}/`).update({status:2}));
				});
				return Promise.all(returns);
			});
		}else{
			return fireDB.child(`/gatherups/${id}/members`).once("value").then(members=>{
				var returns=[];
				members.forEach(member=>{
					returns.push(fireDB.child(`/users/${(member.key)}/gatherups/${id}/`).update({status:1}));
				});
				return Promise.all(returns);
			});
		}
	});
});


exports.setTask = functions.database.ref(`/gatherups/{id}/info/date/`).onWrite((change, context) => {
	let fireDB=change.after.ref.root;
	let id=context.params.id;
	let date=change.after.val();
	if(date!==null&&new Date(date).getTime()>Date.now()){
		return fireDB.child("tasks/"+Math.ceil((new Date(change.after.val()).getTime())/(60*1000))).update({
			[id]:0
		}).then(function(){
			if(change.before.val()!==null&&new Date(change.before.val()).getTime()!==null){
				return fireDB.child("tasks/"+Math.ceil((new Date(change.before.val()).getTime())/(60*1000))+"/"+id).remove();
			}else{
				return Promise.resolve();
			}
		});
	}else{
			if(change.before.val()!==null&&new Date(change.before.val()).getTime()!==null){
				return fireDB.child("tasks/"+Math.ceil((new Date(change.before.val()).getTime())/(60*1000))+"/"+id).remove();
			}else{
				return Promise.resolve();
			}
	}
});


exports.changeTime = functions.database.ref(`/gatherups/{id}/info/date/`).onWrite((change, context) => {
    let id = context.params.id;
    let fireDB = change.after.ref.root;
    let date=change.after.val();
    return fireDB.child(`/gatherups/${id}/members/`).once(`value`).then(members => {
    	var returns=[];
    	members.forEach(member=>{
    		var time=Math.ceil((new Date(change.before.val()).getTime()-(member.val()*1000*60))/(1000*60));
    		var uid=member.key;
    		returns.push(fireDB.child(`/notifications/${time}/${id}/${uid}`).remove().then(function(){
				if(date!==null&&new Date(new Date(date).getTime()-(member.val()*1000*60)).getTime()>new Date().getTime()){
					time=Math.ceil((new Date(change.after.val()).getTime()-(member.val()*1000*60))/(1000*60));
					if(member.val()>0){
						return fireDB.child(`/notifications/${time}/${id}/`).update({
					    	[uid]:member.val()
					    });
				    }else{			
						return Promise.resolve();	
	    			}
				}else{			
					return Promise.resolve();	
	    		}
    		}));
    	});
    	return Promise.all(returns);
	});
});

exports.min_job = functions.pubsub.topic('min-tick').onPublish((event) => {
    let fireDB = admin.database().ref("/");
    var time=Math.floor(new Date().getTime()/(60*1000));
	return fireDB.child(`/notifications/${time}`).once(`value`).then(alerts => {
		var returns=[];
		alerts.forEach(alert=>{
			var id=alert.key;
			returns.push(fireDB.child(`/gatherups/${id}/info`).once(`value`).then(gather => {
				var promises=[];
				alert.forEach(user=>{
					var uid=user.key;
					var info={
						title:gather.val().title+" - Event",
						content:((gather.val().location!==null&&gather.val().location!==undefined)?(gather.val().location.name+", "+gather.val().location.formatted_address.split(",").slice(1,gather.val().location.formatted_address.split(",").length-2).join(",")):"Unknown location")+", in "+user.val()+" minutes.",
						tag:id
					};
					promises.push(fireDB.child(`/users/${uid}/feed/`).push().update(info));
				});
				return Promise.all(promises);
			}));
		});
		return Promise.all(returns).then(function(){
			return fireDB.child(`/notifications/${time}`).remove();
		});
	});
});

exports.min_tick = functions.pubsub.topic('min-tick').onPublish((event) => {
    let fireDB = admin.database().ref("/");
    var time=Math.floor(new Date().getTime()/(60*1000));
	return fireDB.child(`/tasks/${time}`).once(`value`).then( events=> {
		var returns=[];
		events.forEach(event=>{
			returns.push(fireDB.child("gatherups/"+event.key+"/members").once("value").then(members=>{
				var promises=[];
				members.forEach(user=>{
					promises.push(fireDB.child("users/"+user.key+"/gatherups/"+event.key).update({status:2}));
				});
				return Promise.all(promises);
			}));
		});
		return Promise.all(returns);
	});
});
