/**
 * base javascript application
 *
 * @package    public_js
 * @copyright  Copyright (c) Tobias Zeising (http://www.aditu.de)
 * @license    GPLv3 (https://www.gnu.org/licenses/gpl-3.0.html)
 */
var selfoss = {

    /**
     * current filter settings
     * @var mixed
     */
    filter: {
        offset: 0,
        fromDatetime: undefined,
        fromId: undefined,
        itemsPerPage: 0,
        search: '',
        type: 'newest',
        tag: '',
        source: '',
        sourcesNav: false,
        extraIds: [],
        ajax: true
    },

    /**
     * instance of the currently running XHR that is used to reload the items list
     */
    activeAjaxReq: null,

    /**
     * last stats update
     */
    lastSync: Date.now(),

    /**
     * last db timestamp known client side
     */
    lastUpdate: null,

    /**
     * the html title configured
     */
    htmlTitle: 'selfoss',

    /**
     * initialize application
     */
    init: function() {
        jQuery(document).ready(function() {
            if (selfoss.hasSession() || !$('body').hasClass('authenabled')) {
                selfoss.ui.login();
                selfoss.initUi();
            } else if ($('body').hasClass('publicmode')) {
                selfoss.ui.logout();
                selfoss.initUi();
            } else {
                selfoss.ui.logout();
                selfoss.events.setHash('login', false);
            }

            $('#loginform').submit(selfoss.login);
        });
    },


    initUiDone: false,


    initUi: function() {
        if (!selfoss.initUiDone) {
            selfoss.initUiDone = true;

            // set items per page
            selfoss.filter.itemsPerPage = $('#config').data('items_perpage');

            // read the html title configured
            selfoss.htmlTitle = $('#config').data('html_title');

            // init shares
            selfoss.shares.init($('#config').data('share'));

            // init events
            selfoss.events.init();

            selfoss.initCustomIcons();

            // init FancyBox
            selfoss.initFancyBox();

            // init shortcut handler
            selfoss.shortcuts.init();

            // setup periodic stats reloader
            window.setInterval(selfoss.dbOnline.sync, 60 * 1000);

            window.setInterval(selfoss.ui.refreshEntryDatetimes, 60 * 1000);

            selfoss.ui.showMainUi();
        }
    },


    /**
     * returns an array of name value pairs of all form elements in given element
     *
     * @return void
     * @param element containing the form elements
     */
    getValues: function(element) {
        var values = {};

        $(element).find(':input').each(function(i, el) {
            // get only input elements with name
            if ($.trim($(el).attr('name')).length != 0) {
                values[$(el).attr('name')] = $(el).val();
                if ($(el).attr('type') == 'checkbox') {
                    values[$(el).attr('name')] = $(el).attr('checked') ? 1 : 0;
                }
            }
        });

        return values;
    },


    loggedin: false,


    setSession: function() {
        Cookies.set('onlineSession', 'true', {
            expires: 10,
            path: window.location.pathname
        });
        selfoss.loggedin = true;
    },


    clearSession: function() {
        Cookies.remove('onlineSession', {path: window.location.pathname});
        selfoss.loggedin = false;
    },


    hasSession: function() {
        selfoss.loggedin = Cookies.get('onlineSession') == 'true';
        return selfoss.loggedin;
    },


    login: function(e) {
        $('#loginform').addClass('loading');
        var f = $('#loginform form');
        $.ajax({
            type: 'POST',
            url: 'login',
            dataType: 'json',
            data: f.serialize(),
            success: function(data) {
                if (data.success) {
                    $('#password').val('');
                    selfoss.setSession();
                    selfoss.ui.login();
                    selfoss.ui.showMainUi();
                    selfoss.initUi();
                    selfoss.events.initHash();
                } else {
                    selfoss.events.setHash('login', false);
                    selfoss.ui.showLogin(data.error);
                }
            },
            complete: function() {
                $('#loginform').removeClass('loading');
            }
        });
        e.preventDefault();
    },


    logout: function() {
        selfoss.clearSession();
        selfoss.ui.logout();
        if (!$('body').hasClass('publicmode')) {
            selfoss.events.setHash('login', false);
        }

        $.ajax({
            type: 'GET',
            url: 'logout',
            dataType: 'json',
            error: function(jqXHR, textStatus, errorThrown) {
                selfoss.ui.showError('Could not log out: ' +
                                     textStatus + ' ' + errorThrown);
            }
        });
    },


    /**
     * insert error messages in form
     *
     * @return void
     * @param form target where input fields in
     * @param errors an array with all error messages
     */
    showErrors: function(form, errors) {
        $(form).find('span.error').remove();
        $.each(errors, function(key, val) {
            form.find("[name='" + key + "']").addClass('error').parent('li').append('<span class="error">' + val + '</span>');
        });
    },


    /**
     * indicates whether a mobile device is host
     *
     * @return true if device resolution smaller equals 1024
     */
    isMobile: function() {
        // first check useragent
        if ((/iPhone|iPod|iPad|Android|BlackBerry/).test(navigator.userAgent)) {
            return true;
        }

        // otherwise check resolution
        return selfoss.isTablet() || selfoss.isSmartphone();
    },


    /**
     * indicates whether a tablet is the device or not
     *
     * @return true if device resolution smaller equals 1024
     */
    isTablet: function() {
        if ($(window).width() <= 1024) {
            return true;
        }
        return false;
    },


    /**
     * indicates whether a tablet is the device or not
     *
     * @return true if device resolution smaller equals 1024
     */
    isSmartphone: function() {
        if ($(window).width() <= 640) {
            return true;
        }
        return false;
    },


    /**
     * reset filter
     *
     * @return void
     */
    filterReset: function() {
        selfoss.filter.offset = 0;
        selfoss.filter.fromDatetime = undefined;
        selfoss.filter.fromId = undefined;
        selfoss.filter.extraIds.length = 0;
    },


    /**
     * refresh stats.
     *
     * @return void
     * @param new all stats
     * @param new unread stats
     * @param new starred stats
     */
    refreshStats: function(all, unread, starred) {
        $('.nav-filter-newest span').html(all);
        $('.nav-filter-starred span').html(starred);

        selfoss.refreshUnread(unread);
    },


    /**
     * refresh unread stats.
     *
     * @return void
     * @param new unread stats
     */
    refreshUnread: function(unread) {
        $('span.unread-count').html(unread);

        if (unread > 0) {
            $('span.unread-count').addClass('unread');
        } else {
            $('span.unread-count').removeClass('unread');
        }

        selfoss.ui.refreshTitle(unread);
    },


    /**
     * refresh current tags.
     *
     * @return void
     */
    reloadTags: function() {
        $('#nav-tags').addClass('loading');
        $('#nav-tags li:not(:first)').remove();

        $.ajax({
            url: $('base').attr('href') + 'tagslist',
            type: 'GET',
            success: function(data) {
                $('#nav-tags').append(data);
                selfoss.events.navigation();
            },
            error: function(jqXHR, textStatus, errorThrown) {
                selfoss.ui.showError('Load tags error: ' +
                                     textStatus + ' ' + errorThrown);
            },
            complete: function() {
                $('#nav-tags').removeClass('loading');
            }
        });
    },


    /**
     * refresh taglist.
     *
     * @return void
     * @param tags the new taglist as html
     */
    refreshTags: function(tags) {
        $('.color').spectrum('destroy');
        $('#nav-tags li:not(:first)').remove();
        $('#nav-tags').append(tags);
        if (selfoss.filter.tag) {
            if (!selfoss.db.isValidTag(selfoss.filter.tag)) {
                selfoss.ui.showError('Unknown tag: ' + selfoss.filter.tag);
            }

            $('#nav-tags li:first').removeClass('active');
            $('#nav-tags > li').filter(function() {
                if ($('.tag', this)) {
                    return $('.tag', this).html() == selfoss.filter.tag;
                } else {
                    return false;
                }
            }).addClass('active');
        } else {
            $('.nav-tags-all').addClass('active');
        }

        selfoss.events.navigation();
    },


    sourcesNavLoaded: false,

    /**
     * refresh sources list.
     *
     * @return void
     * @param sources the new sourceslist as html
     */
    refreshSources: function(sources) {
        $('#nav-sources li').remove();
        $('#nav-sources').append(sources);
        if (selfoss.filter.source) {
            if (!selfoss.db.isValidSource(selfoss.filter.source)) {
                selfoss.ui.showError('Unknown source id: '
                                     + selfoss.filter.source);
            }

            $('#source' + selfoss.filter.source).addClass('active');
            $('#nav-tags > li').removeClass('active');
        }

        selfoss.sourcesNavLoaded = true;
        if ($('#nav-sources-title').hasClass('nav-sources-collapsed')) {
            $('#nav-sources-title').click(); // expand sources nav
        }

        selfoss.events.navigation();
    },


    /**
     * anonymize links
     *
     * @return void
     * @param parent element
     */
    anonymize: function(parent) {
        var anonymizer = $('#config').data('anonymizer');
        if (anonymizer.length > 0) {
            parent.find('a').each(function(i, link) {
                link = $(link);
                if (typeof link.attr('href') != 'undefined' && link.attr('href').indexOf(anonymizer) != 0) {
                    link.attr('href', anonymizer + link.attr('href'));
                }
            });
        }
    },


    /**
     * Setup fancyBox image viewer
     * @param content element
     * @param int
     */
    setupFancyBox: function(content, id) {
        // Close existing fancyBoxes
        $.fancybox.close();
        var images = $(content).find('a[href$=".jpg"], a[href$=".jpeg"], a[href$=".png"], a[href$=".gif"], a[href$=".jpg:large"], a[href$=".jpeg:large"], a[href$=".png:large"], a[href$=".gif:large"]');
        $(images).attr('data-fancybox', 'gallery-' + id).unbind('click');
        $(images).attr('data-type', 'image');
    },

    /**
     * Register custom icons to the FontAwesome framework
     */
    initCustomIcons: function() {
        // wallabag.svg: Free Art License 1.3 https://github.com/wallabag/logo
        var wallabag = {
          prefix: 'fac',
          iconName: 'wallabag',
          icon: [
            200, 200,
            [],
            null,
            'M 122.24805 33.220703 C 122.00692 33.195062 121.7362 33.303531 121.4707 33.519531 C 120.8987 33.984531 115.9198 35.1345 112.9668 37.4375 C 108.1988 41.1575 105.25973 48.232531 103.92773 52.144531 C 103.90273 52.204531 103.72211 52.747547 103.66211 52.935547 C 103.04111 54.433547 101.80469 54.429688 101.80469 54.429688 L 101.80469 54.431641 C 101.20469 54.366641 100.60309 54.330078 99.996094 54.330078 C 99.456094 54.330078 98.917859 54.360109 98.380859 54.412109 C 98.368859 54.414109 98.361609 54.411109 98.349609 54.412109 C 96.768609 54.645109 95.898797 52.715859 95.716797 52.255859 C 93.869797 46.951859 88.900422 36.493688 77.732422 33.679688 C 77.732422 33.679688 75.704266 32.125906 76.322266 34.753906 C 76.910266 37.264906 78.127422 39.802141 77.857422 43.494141 C 77.733422 45.198141 76.676031 53.936375 84.707031 58.484375 C 85.470031 58.916375 86.147813 59.279937 86.757812 59.585938 C 82.715812 62.820937 79.041437 67.3245 75.898438 72.4375 C 77.495437 71.4565 86.105094 66.881234 99.996094 72.615234 C 114.28509 78.512234 123.151 73.392313 124.25 72.695312 C 120.796 67.017313 116.68848 62.074953 112.14648 58.751953 C 112.44948 58.668953 112.75894 58.584281 113.08594 58.488281 C 119.10894 56.746281 120.63894 51.647297 120.96094 47.279297 C 121.32494 42.325297 121.57634 42.249969 122.65234 37.792969 C 123.42634 34.582219 122.97142 33.297625 122.24805 33.220703 z M 100.33203 83.445312 C 99.810512 83.426867 99.264312 83.506922 98.679688 83.701172 C 98.203688 83.860172 97.756656 84.067406 97.347656 84.316406 C 96.912656 84.581406 96.544906 84.912781 96.253906 85.300781 C 95.931906 85.732781 95.767578 86.202266 95.767578 86.697266 L 95.767578 103.00391 C 95.767578 105.16191 95.405453 106.75437 94.689453 107.73438 C 94.001453 108.67337 92.839625 109.13086 91.140625 109.13086 C 89.435625 109.13086 88.263641 108.67052 87.556641 107.72852 C 86.822641 106.74952 86.449219 105.15991 86.449219 103.00391 L 86.449219 86.947266 C 86.449219 86.039266 86.065687 85.219766 85.304688 84.509766 C 84.553687 83.807766 83.554031 83.451172 82.332031 83.451172 C 81.074031 83.451172 80.035094 83.803094 79.246094 84.496094 C 78.435094 85.206094 78.025391 86.032266 78.025391 86.947266 L 78.025391 102.75391 C 78.025391 104.74191 78.218609 106.6228 78.599609 108.3418 C 78.992609 110.0998 79.676766 111.64173 80.634766 112.92773 C 81.602766 114.22673 82.917016 115.24956 84.541016 115.97656 C 86.148016 116.69256 88.157625 117.05664 90.515625 117.05664 C 92.972625 117.05664 95.030859 116.60017 96.630859 115.70117 C 97.972859 114.94717 99.103953 113.95895 100.00195 112.75195 C 100.86795 113.95895 101.97388 114.94817 103.29688 115.70117 C 104.87687 116.60017 106.96581 117.05469 109.50781 117.05469 C 111.86481 117.05469 113.86512 116.69161 115.45312 115.97461 C 117.05412 115.24861 118.35617 114.22278 119.32617 112.92578 C 120.28617 111.63578 120.97038 110.09284 121.35938 108.33984 C 121.74038 106.62084 121.93555 104.73995 121.93555 102.75195 L 121.93555 86.947266 C 121.93555 86.036266 121.53795 85.213953 120.75195 84.501953 C 119.98495 83.804953 118.93286 83.451172 117.63086 83.451172 C 116.44986 83.451172 115.46975 83.807766 114.71875 84.509766 C 113.95875 85.219766 113.57422 86.040266 113.57422 86.947266 L 113.57422 103.00391 C 113.57422 105.15791 113.19245 106.74561 112.43945 107.72461 C 111.71145 108.67061 110.54877 109.13086 108.88477 109.13086 C 107.18177 109.13086 106.02194 108.67338 105.33594 107.73438 C 104.61994 106.75538 104.25781 105.16391 104.25781 103.00391 L 104.25781 86.884766 C 104.25781 85.786766 103.75659 84.887109 102.80859 84.287109 C 102.00297 83.779609 101.20123 83.476055 100.33203 83.445312 z M 65.353516 115.58008 C 65.795516 117.58808 66.42775 119.50327 67.21875 121.32227 C 67.88475 125.06727 68.779922 133.88452 64.544922 141.60352 C 60.813922 148.40352 42.395547 157.67256 15.060547 152.35156 C 15.060547 152.35156 13.964813 151.5868 13.632812 152.2168 C 13.141813 153.1488 15.148844 153.90131 17.214844 154.44531 C 36.245844 159.48531 64.971187 157.43395 73.992188 150.00195 C 78.108187 146.61395 79.696609 142.04872 80.099609 137.13672 L 80.101562 137.14453 C 80.101562 137.14453 80.211313 135.85722 81.820312 136.82422 C 82.281312 137.10122 83.945937 138.18516 84.210938 139.41016 C 84.442937 141.15316 84.458594 143.29397 83.558594 144.79297 C 82.271594 146.93697 82.257172 147.24313 83.951172 148.45312 C 84.991172 149.19512 89.239391 152.31814 95.150391 155.86914 C 95.165391 155.87914 95.1725 155.88848 95.1875 155.89648 C 96.4375 156.64948 98.175781 158.49219 98.175781 158.49219 C 100.83778 161.57119 106.62648 167.76856 109.14648 166.60156 C 110.33648 166.05056 109.0957 163.56836 109.0957 163.56836 C 109.0957 163.56836 111.07567 166.14067 112.13867 165.26367 C 112.94767 164.59567 111.66602 162.0332 111.66602 162.0332 C 111.66602 162.0332 113.39583 163.53352 114.42383 162.97852 C 115.68183 162.29952 114.23575 158.36456 104.34375 152.35156 C 94.44775 146.33356 91.765297 145.41061 91.529297 142.72461 C 91.529297 142.72461 91.525203 142.59038 91.533203 142.35938 C 91.610203 141.76638 91.948719 140.51148 93.386719 140.64648 C 95.527719 140.99248 97.734141 141.17773 99.994141 141.17773 C 102.58114 141.17773 105.1003 140.94128 107.5293 140.48828 L 107.53125 140.49023 C 107.53125 140.49023 107.65831 140.46694 107.69531 140.46094 C 107.97931 140.42494 108.53316 140.44186 108.53516 141.13086 C 108.44516 142.00386 108.20345 142.88239 107.68945 143.65039 C 106.24245 145.81839 106.71847 146.11677 108.23047 147.50977 C 109.16347 148.36877 113.44178 152.13144 119.30078 155.77344 C 119.31278 155.78244 119.31608 155.78987 119.33008 155.79688 C 120.57908 156.54888 122.74023 158.61133 122.74023 158.61133 C 125.16823 161.07733 129.63536 165.20603 132.06836 164.95703 C 133.71436 164.78903 132.37305 161.95508 132.37305 161.95508 C 132.37305 161.95508 134.45166 163.96109 135.47266 163.37109 C 136.61466 162.71209 134.99805 160.61719 134.99805 160.61719 C 134.99805 160.61719 136.33625 161.32484 137.28125 161.08984 C 138.22925 160.85384 138.46795 158.44652 128.62695 152.35352 C 118.78495 146.25552 115.47269 144.11034 115.67969 141.77734 C 115.67969 141.77734 115.6823 141.39831 115.7793 140.82031 C 116.0183 139.58431 116.77355 137.47353 119.18555 136.26953 C 119.26455 136.23053 119.33253 136.18563 119.39453 136.14062 C 127.06253 131.69063 132.66462 124.52608 134.64062 115.58008 C 132.65062 120.52108 117.90414 124.35937 99.994141 124.35938 C 82.091141 124.35938 67.343516 120.52108 65.353516 115.58008 z'
          ]
        };
        fontawesome.library.add(wallabag);
    },


    /**
     * Initialize FancyBox globally
     */
    initFancyBox: function() {
        $.fancybox.defaults.hash = false;
    },


    /**
     * Mark all visible items as read
     */
    markVisibleRead: function() {
        var ids = [];
        $('.entry.unread').each(function(index, item) {
            ids.push($(item).attr('id').substr(5));
        });

        if (ids.length === 0) {
            $('.entry').remove();
            if (selfoss.filter.type == 'unread' &&
                parseInt($('span.unread-count').html()) > 0) {
                selfoss.dbOnline.reloadList();
            } else {
                selfoss.ui.refreshStreamButtons(true);
            }
            return;
        }

        // show loading
        var content = $('#content');
        var articleList = content.html();
        $('#content').addClass('loading').html('');
        var hadMore = $('.stream-more').is(':visible');
        selfoss.ui.refreshStreamButtons();

        // close opened entry and list
        selfoss.events.setHash();
        selfoss.filterReset();

        $.ajax({
            url: $('base').attr('href') + 'mark',
            type: 'POST',
            dataType: 'json',
            data: {
                ids: ids
            },
            success: function() {
                $('.entry').removeClass('unread');

                // update unread stats
                var unreadstats = parseInt($('.nav-filter-unread span').html()) - ids.length;
                selfoss.refreshUnread(unreadstats);

                // hide nav on smartphone if visible
                if (selfoss.isSmartphone() && $('#nav').is(':visible') == true) {
                    $('#nav-mobile-settings').click();
                }

                // refresh list
                selfoss.dbOnline.reloadList();
            },
            error: function(jqXHR, textStatus, errorThrown) {
                content.html(articleList);
                $('#content').removeClass('loading');
                selfoss.ui.refreshStreamButtons(true, true, hadMore);
                selfoss.events.entries();
                selfoss.ui.showError('Can not mark all visible item: ' +
                                     textStatus + ' ' + errorThrown);
            }
        });
    }

};

selfoss.init();
