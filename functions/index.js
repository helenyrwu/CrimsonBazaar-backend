// Copyright 2017 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var functions = require('firebase-functions');

const firebase = require('firebase');

var moment = require('moment');

require('firebase/firestore');

const config = {
  apiKey: "AIzaSyAnJo5KOL3_Jvc0GqWYWgFb1auuFZb9z8I",
  authDomain: "crimsonbazaar-dev.firebaseapp.com",
  databaseURL: "https://crimsonbazaar-dev.firebaseio.com",
  projectId: "crimsonbazaar-dev",
  storageBucket: "crimsonbazaar-dev.appspot.com",
  messagingSenderId: "733620785594"
};
firebase.initializeApp(config);

const db = firebase.firestore();

// exports.hourly_job =
//   functions.pubsub.topic('hourly-tick').onPublish((event) => {
//     console.log("This job is ran every hour!")
//   });



function Graph(vertices){
    this.vertices = vertices || [];
}

function Vertex(name){
    this.name = name || null;
    this.connections = [];
    
    // used in tarjan algorithm
    // went ahead and explicity initalized them
    this.index= -1;
    this.lowlink = -1;
}
Vertex.prototype = {
    equals: function(vertex){
        // equality check based on vertex name
        return (vertex.name && this.name==vertex.name);
    }
};

function VertexStack(vertices) {
    this.vertices = vertices || [];
}
VertexStack.prototype = {
    contains: function(vertex){
        for (var i in this.vertices){
            if (this.vertices[i].equals(vertex)){
                return true;
            }
        }
        return false;
    }
};

function Tarjan(graph) {
    this.index = 0;
    this.stack = new VertexStack();
    this.graph = graph;
    this.scc = [];
}
Tarjan.prototype = {
    run: function(){
        for (var i in this.graph.vertices){
            if (this.graph.vertices[i].index<0){
                this.strongconnect(this.graph.vertices[i]);
            }
        }
        return this.scc;
    },
    strongconnect: function(vertex){
        // Set the depth index for v to the smallest unused index
        vertex.index = this.index;
        vertex.lowlink = this.index;
        this.index = this.index + 1;
        this.stack.vertices.push(vertex);
        
        // Consider successors of v
        // aka... consider each vertex in vertex.connections
        for (var i in vertex.connections){
            var v = vertex;
            var w = vertex.connections[i];
            if (w.index<0){
                // Successor w has not yet been visited; recurse on it
                this.strongconnect(w);
                v.lowlink = Math.min(v.lowlink,w.lowlink);
            } else if (this.stack.contains(w)){
                // Successor w is in stack S and hence in the current SCC
                v.lowlink = Math.min(v.lowlink,w.index);
            }
        }
        
        // If v is a root node, pop the stack and generate an SCC
        if (vertex.lowlink==vertex.index){
            // start a new strongly connected component
            var vertices = [];
            var w = null;
            if (this.stack.vertices.length>0){
                do {
                    w = this.stack.vertices.pop();
                    // add w to current strongly connected component
                    vertices.push(w);
                } while (!vertex.equals(w));
            }
            // output the current strongly connected component
            // ... i'm going to push the results to a member scc array variable
            // if (vertices.length>1 || vertices[0].connections.includes(vertices[0])){
            if (vertices.length > 1) {
                this.scc.push(vertices);
            }
        }
    }
};



// owner_obj: itemID -> userID
// item_to_pref: itemID -> pref list [most_preferred_item, 2nd_preferred, ...]
function TTC(owner_obj, item_to_pref) {
	all_trades = [];
	do {

		trades = [];
		// item->owners allocated
		allocated = {};
		var vertices = {};
		for (var item in item_to_pref) {
			var vertex = new Vertex(item);
			vertices[item] = vertex;
		}
		// console.log(vertices);
		for (var item in item_to_pref) {
			var pref_item;
			do {
				 pref_item = item_to_pref[item].shift();
				 // console.log(pref_item);
			} while(!(pref_item in vertices));
			vertices[item].connections.push(vertices[pref_item]);
		}

		vertices = Object.keys(vertices).map(function(key) {
			return vertices[key];
		});

		console.log(vertices);
		var graph = new Graph(vertices);
		var tarjan = new Tarjan(graph);
		var scc = tarjan.run();
		// console.log(scc);
		for (var component of scc) {
			// console.log(component);
			component.sort(function(a,b) {
				return a.index - b.index;
			});
			// console.log("round 2");
			// console.log(scc);
			// iterate through indicies of scc
			for (var i in component) {
				// console.log(i);
				var current_item = component[i].name;
				// console.log(current_item);
				if (i == component.length-1) {
					// console.log(component[0]);
					trades.push({
						completed: false,
						fromUser: owner_obj[current_item],
						toUser: owner_obj[component[0].name],
						item: current_item
					});
				}
				else {
					// console.log(component[parseInt(i)+1]);
					trades.push({
						completed: false,
						fromUser: owner_obj[current_item],
						toUser: owner_obj[component[parseInt(i)+1].name],
						item: current_item
					});
				}
				
				delete item_to_pref[current_item];
			}
			// console.log(trades);
			all_trades = all_trades.concat(trades);
		}
		// console.log("round 2");
		// console.log(scc);
	} while(trades.length > 0);
	return all_trades;
}



exports.weekly_job = 
	functions.pubsub.topic('weekly-tick').onPublish((event) => {

		var query = db.collection('auctions').get().then(auctions_snapshot => {
			//get current time -- TODO fix query so it does this automatically
			var current_time = new Date().getTime();
			var end_date = moment().day(6).hour(4).minute(55).second(0).toDate();

			var results_obj = {};

			auctions_snapshot.forEach(auction => {
				data = auction.data();
				// console.log(auction.id);

				// if auction has ended
				// if (data.end <= current_time && data.start >= new Date(+new Date - 9072e5)) {
				if (data.end <= current_time && data.active) {
					// console.log('hiiiiiiii');
					var pref_obj = {};
					var owner_obj = {};	
					var item_to_pref = {};

					db.collection('auctions').add({
						active: true,
						start: new Date(),
						end: end_date,
						title: data.title,
						items: {},
						participants: {}
					});

					db.collection('preferences').where('auction', '==', auction.id).get().then(prefs_snapshot => {
					// owner to pref array
						// // shouldnt initiate trade with themselves
						prefs_snapshot.forEach(pref => {
							// console.log("inside");
							pref_data = pref.data()
							pref_obj[pref_data.owner] = Object.keys(pref_data.preference).map(function(key){
								return pref_data.preference[key];
							});
						});
						// console.log("outside");

						db.collection('items').where('auction', '==', auction.id).get().then(items_snapshot => {
							// item to owner
							items_snapshot.forEach(item => {
								owner_obj[item.id] = item.data().owner;
								item_to_pref[item.id] = pref_obj[item.data().owner];
							});
							// console.log("auction id", auction.id);
							// console.log("items => owners");
							// console.log(owner_obj);
							// console.log("owners => prefs");
							// console.log(pref_obj);
							// console.log("item => prefs");
							// console.log(item_to_pref);
							trades = TTC(owner_obj, item_to_pref);
							for (trade of trades) {
								console.log(trade);
								db.collection('trades').add(trade);
							}
							db.collection('auctions').doc(auction.id).update({
								active: false
							});
						});
					});
				}
			});
		});


		// replenish new auctions
		// db.collection('auctions').get().then(auctions_snapshot => {
		// 	auction_titles = [];
		// 	auctions_snapshot.forEach(auction => {
		// 		if(!(auction.data().title in auction_titles)) {
		// 			auction_titles.push(auction.data().title);
		// 		}
		// 	});
		// 	for (title of auction_titles) {

		// 	}
		// });
	});