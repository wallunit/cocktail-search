document.addEventListener('DOMContentLoaded', function() {
	var Cocktail = Backbone.Model.extend();

	var SearchResults = Backbone.Collection.extend({
		model: Cocktail,

		url: function() {
			var params = [];

			if (this.index_updated)
				params.push({name: 'index_updated', value: this.index_updated});

			for (var i = 0; i < this.ingredients.length; i++)
				params.push({name: 'ingredient', value: this.ingredients[i]});

			return '/recipes' + (params.length ? '?' + $.param(params) : '');
		},

		parse: function(resp, options) {
			this.canLoadMore = resp.cocktails.length > 0;
			this.index_updated = resp.index_updated;

			return resp.cocktails;
		}
	});

	var CocktailView = Backbone.View.extend({
		className: 'cocktail',

		events: {
			'click .sources a[href]': 'onSwitchRecipe'
		},

		template: _.template(document.getElementById('cocktail-template').innerHTML),

		adjustSourcesWidth: function() {
			_.each(this.el.querySelectorAll('.sources li'), function(source) {
				var label = source.children[0];
				var text = label.getAttribute('data-source');

				label.textContent = text.substr(0, 1) + '...';
				var maxWidth = source.scrollWidth;

				label.textContent = text;
				while (source.scrollWidth > maxWidth)
					label.textContent = (text = text.slice(0, -1)) + '...';
			});
		},

		backupScrollPosition: function() {
			return window.pageYOffset - this.el.getElementsByClassName('sources')[0].offsetTop;
		},

		restoreScrollPosition: function(pos) {
			window.scrollTo(window.pageXOffset, pos + this.el.getElementsByClassName('sources')[0].offsetTop);
		},

		render: function() {
			var sources = _.groupBy(
				this.model.get('recipes'),
				function(recipe) { return recipe.source; }
			);

			var recipe = sources[
				this.currentSource || Object.keys(sources)[0]
			][
				this.currentRecipe || 0
			];

			this.el.innerHTML = this.template({recipe: recipe, sources: sources});
			return this;
		},

		onSwitchRecipe: function(event) {
			var scrollPos = this.backupScrollPosition();

			this.currentSource = event.currentTarget.getAttribute('data-source');
			this.currentRecipe = event.currentTarget.getAttribute('data-recipe');

			this.setElement(this.render().$el);
			this.adjustSourcesWidth();
			this.restoreScrollPosition(scrollPos);
		}
	});

	var SearchResultsView = Backbone.View.extend({
		el: document.getElementById('search-results'),

		events: {
			'mousedown': 'onMouseDown'
		},

		initialize : function(options) {
			_.bindAll(this, 'add', 'remove', 'adjustSourcesWidth');

			this.cocktailViews = [];

			this.collection.each(this.add);

			this.collection.bind('add', this.add);
			this.collection.bind('remove', this.remove);
		},

		add: function(cocktail) {
			var view = new CocktailView({model: cocktail});

			this.el.appendChild(view.el);
			this.cocktailViews.push(view);

			view.render();
			view.setElement(view.$el);
			view.adjustSourcesWidth();
		},

		remove: function(cocktail) {
			for (var i = 0; i < this.cocktailViews.length; i++) {
				var view = this.cocktailViews[i];

				if (view.model == cocktail) {
					this.el.removeChild(view.el);
					this.cocktailViews = _.without(this.cocktailViews, view);
				}
			}
		},

		adjustSourcesWidth: function() {
			_.invoke(this.cocktailViews, 'adjustSourcesWidth');
		},

		loadMoreIfPossible: function() {
			var view;

			if (!this.collection.canLoadMore)
				return;

			if (view = this.cocktailViews[this.cocktailViews.length - 5])
			if (view.el.offsetTop > window.pageYOffset + document.documentElement.clientHeight)
				return;

			this.collection.canLoadMore = false;
			this.collection.fetch({remove:false, data: {offset: this.collection.length}});
		},

		onMouseDown: function() {
			state_is_volatile = false;
		}
	});

	var FirefoxWarningView = Backbone.View.extend({
		el: document.getElementById('firefox-warning'),

		render: function() {
			var firefoxVersion = navigator.userAgent.match(/ Firefox\/([\d.]+)/);

			if (firefoxVersion)
			if (!('flex'    in document.body.style))
			if (!('MozFlex' in document.body.style))
				this.$el.html(_.template(
					document.getElementById('firefox-warning-template').innerHTML, {
						version: firefoxVersion[1],
						android: navigator.userAgent.indexOf('Android;')    != -1,
						debian:  navigator.userAgent.indexOf(' Iceweasel/') != -1
					}
				));

			return this;
		}
	});

	var collection = new SearchResults();
	var searchResultsView = new SearchResultsView({collection: collection});

	var firefoxWarningView = new FirefoxWarningView();
	firefoxWarningView.setElement(firefoxWarningView.render());

	var form = document.getElementsByTagName('form')[0];
	var initial_field = form.children[0];
	initial_field.value = '';
	var empty_field = initial_field.cloneNode();
	var original_title = document.title;

	var offset = 0;
	var ingredients;

	var state;
	var state_is_volatile;

	var updateTitle = function() {
		var title = original_title;

		if (ingredients.length > 0)
			title += ': ' + ingredients.join(', ');
		document.title = title;
	};

	var prepareField = function(field) {
		field.addEventListener('input', function() {
			var has_empty = false;
			var new_state;

			ingredients = [];

			_.each(form.children, function(field, idx) {
				if (field.value != '')
					ingredients.push(field.value);
				else
					has_empty = true;
			});

			new_state  = ingredients.length > 0 ? '#' : '';
			new_state += ingredients.map(encodeURIComponent).join(';');

			if (!has_empty)
				addField();

			if (new_state == state)
				return;

			history[
				state_is_volatile
					? 'replaceState'
					: 'pushState'
			](null, null, new_state || '.');

			state = new_state;
			state_is_volatile = true;

			updateTitle();

			collection.ingredients = ingredients;
			collection.fetch();
		}, false);

		field.addEventListener('blur', function() {
			_.each(
				_.filter(
					form.children,
					function(field) {
						return field.value == '';
					}
				).slice(0, -1),
				function(field) {
					form.removeChild(field);
				}
			);
		}, false);
	};

	var addField = function () {
		var field = empty_field.cloneNode();

		form.appendChild(field);
		prepareField(field);

		return field;
	};

	var populateForm = function() {
		state = document.location.hash;
		state_is_volatile = false;
		ingredients = collection.ingredients = [];
		form.innerHTML = '';

		_.each(state.substring(1).split(';'), function(ingredient) {
			ingredient = decodeURIComponent(ingredient);

			if (ingredient == '')
				return;

			var field = addField();
			field.value = ingredient;

			ingredients.push(ingredient);
		});

		addField().focus();
		updateTitle();
		collection.fetch();
	};

	var adjustSourcesWidthOnResize = function() {
		var width = document.width || window.innerWidth;

		if (width > 580 && width <= 1000)
			// the width of the sources stays constant at
			// a document width of between 581px and 1000px
			var mediaQueryList = matchMedia('(min-width: 581px) and (max-width: 1000px)');
		else
			var mediaQueryList = matchMedia('(width: ' + width + 'px)');

		var listener = function() {
			mediaQueryList.removeListener(listener);
			adjustSourcesWidthOnResize();
			searchResultsView.adjustSourcesWidth();
		};

		mediaQueryList.addListener(listener);
	};

	window.addEventListener('scroll', function() {
		state_is_volatile = false;
		searchResultsView.loadMoreIfPossible();
	}, false);

	window.addEventListener('popstate', populateForm);

	prepareField(initial_field);
	populateForm();
	adjustSourcesWidthOnResize();
}, false);
