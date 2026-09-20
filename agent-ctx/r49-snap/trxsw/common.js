var mobileAgent = new Array("iphone", "ipod", "ipad", "android", "mobile", "blackberry", "webos", "incognito", "webmate", "bada", "nokia", "lg", "ucweb", "skyfire");
var browser = navigator.userAgent.toLowerCase();
for (var i=0; i<mobileAgent.length; i++){
	if (browser.indexOf(mobileAgent[i])!=-1){
		if(window.location.href.indexOf('//www.') > 0) {
			window.location.href = window.location.href.replace('//www.', '//m.');
		}
		break;
	}
}

/*统计-代码*/
  var _mtj = _mtj || [];
  (function () {
  var mtj = document.createElement("script");
  mtj.src = "https://node94.aizhantj.com:21233/tjjs/?k=varjju8rp8f";
  var s = document.getElementsByTagName("script")[0];
  s.parentNode.insertBefore(mtj, s);
  })();
/*--------*/


/*统计代码*/
var _hmt = _hmt || [];
(function() {
  var hm = document.createElement("script");
  hm.src = "https://hm.baidu.com/hm.js?f7c419b5c2bfd97697eb80211a086eae";
  var s = document.getElementsByTagName("script")[0]; 
  s.parentNode.insertBefore(hm, s);
})();
/*--------------------*/

(function(){
	/*百度推送代码*/
    var bp = document.createElement('script');
    var curProtocol = window.location.protocol.split(':')[0];
    if (curProtocol === 'https') {
        bp.src = 'https://zz.bdstatic.com/linksubmit/push.js';
    }
    else {
        bp.src = 'http://push.zhanzhang.baidu.com/push.js';
    }
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(bp, s);
    /*360推送代码*/	
    var src = (document.location.protocol == "http:") ? "http://js.passport.qihucdn.com/11.0.1.js?01959b325dc65222fab1284ee47c3b56":"https://jspassport.ssl.qhimg.com/11.0.1.js?01959b325dc65222fab1284ee47c3b56";
    document.write('<script src="' + src + '" id="sozz"><\/script>');
})();
var user;
if (document.cookie.length > 0) {
	var offset = document.cookie.indexOf("_user=");
	if (offset > -1) {
		offset += 6;
		var end = document.cookie.indexOf(";", offset);
		if (end == -1) end = document.cookie.length;
		user = JSON.parse(unescape(document.cookie.substring(offset, end)));
	}
}
function active(url){
	if (!user) {
		if (confirm('您尚未登录，是否马上登录？')) {
			window.location.href='/login.html?jumpurl='+escape(window.location.href);
		}
		return;
	}
	var xhr = new XMLHttpRequest();          
	xhr.open('GET', url, true);
	xhr.onreadystatechange = function() {
		if (xhr.readyState == 4 && xhr.status == 200 || xhr.status == 304) {
			var json = JSON.parse(xhr.responseText);
			alert(json._info);
		}
	}
	xhr.send();
}
function vote(id){
	id = id || 0;
	active('/book/vote/'+id+'/?d=json&r='+Math.random());
}
function mark(id, cid){
	id = id || 0;
	cid = cid || 0;
	active('/mark/add/'+id+'/'+cid+'/?d=json&r='+Math.random());
}
function init(type){
	if (type==='top') {
		$('.tabRight span').click(function(){
			$(this).addClass('cur').siblings().removeClass('cur');
			$(this).parents('.toptab').next('div').children('ul').hide().eq($(this).index()).show();
		});
		return;
	}
	if (type==='history') {
		var list = [];
		for (var i=0; i<window.localStorage.length; i++) {
			if (window.localStorage.key(i).substr(0,5) === 'book_') {
				var book = JSON.parse(window.localStorage.getItem(window.localStorage.key(i)));
				if (!book.readid) continue;
				book.id = window.localStorage.key(i).substr(5);
				list.push(book);
			}
		}
		list.sort(function(a, b){
			return b.readtime - a.readtime;
		});
		var html = '';
		for (var i=0; i<list.length; i++) {
			var now = new Date(list[i].readtime);
            var year=now.getFullYear();    
            var month=now.getMonth()+1;    
            var date=now.getDate();    
            var hour=now.getHours();    
            var minute=now.getMinutes();    
            var second=now.getSeconds(); 
			var time=year+"-"+month+"-"+date+"   "+hour+":"+minute+":"+second;
			html += '<dl id="alistbox" article-id="'+list[i].id+'"><div class="pic"> <a target="_blank" href="/xiaoshuo_'+list[i].id+'.html"><img src="https://img.33yq.com/image/'+Math.floor(list[i].id/1000)+'/'+list[i].id+'/'+list[i].id+'s.jpg" onerror="this.onerror=null;this.src=\'/static/image/nocover.jpg\'" width="115px" height="160px"></a> </div><div class="info"><div class="title"><h2>《<a target="_blank" href="/read/'+list[i].id+'/">'+list[i].name+'</a>》</h2></div><div class="sys"><li>作者：'+list[i].author+'</li><li>读到：'+(list[i].readid>0?'<a href="/read/'+list[i].id+'/'+list[i].readid+'.shtml">'+list[i].readname+'</a>':'暂未阅读')+'</li><li>时间：'+time+'</li></div><div class="yuedu"> <a href="/read/'+list[i].id+'/'+list[i].readid+'.shtml">继续阅读</a>  <a class="delbtn">移除记录</a></div></div></dl>';
		}
		
		
		$('#sitebox').html(html);
		$('#history_num').text(list.length);
		$('#sitebox').on('click', 'a.delbtn', function(){
			var li = $(this).parents('dl');
			window.localStorage.removeItem('book_'+li.attr('article-id'));
			li.remove();
			$('#history_num').text($('#sitebox dl').length);
			return false;
		});
		$('#history_clear').click(function(){
			if (confirm('确定清空吗？ ')){
				$('#sitebox dl').each(function(){
					window.localStorage.removeItem('book_'+$(this).attr('article-id'));
				});
				$('#sitebox').html('');
				$('#history_num').text('0');
			}
		});
		return;
	}
	var articleid = $('body').attr('article-id') || 0, chapterid = $('body').attr('chapter-id') || 0;
	if (chapterid > 0) {
		var book = {name:$('#bookname').text(),author:$('#author').text(),dataid:$('body').attr('data-id')||0,readid:chapterid,readname:$('.zhangjieming h1').text(),readtime:$.now()};
		window.localStorage.setItem('book_'+articleid, JSON.stringify(book));
		var theme = function(v){
			if (typeof v === 'undefined') v = window.localStorage.getItem('theme') || 'day';
			$('body').attr('class', v);
			$('li.theme a.'+v).addClass('on').siblings().removeClass('on');
			window.localStorage.setItem('theme', v);
		};
		var size = function(v){
			if (typeof v === 'undefined') v = parseInt(window.localStorage.getItem('size')) || 24;
			$('li.size a.num').text(v);
			$('#content').css('font-size', v);
			$('li.size a').removeClass('disabled');
			if (v<=10) $('li.size a.dec').addClass('disabled');
			if (v>=50) $('li.size a.inc').addClass('disabled');
			$('#fontsize').text(v);
			window.localStorage.setItem('size', v);
		};
		$('li.theme a').click(function(){
			theme($(this).attr('class'));
		});
		$('li.size a').click(function(){
			if ($(this).hasClass('disabled')) return;
			size(parseInt($('#fontsize').text()) + ($(this).hasClass('dec') ? -2 : 2));
		});
		$('li.reset').click(function(){
			theme('day');
			size(24);
		});
		theme();
		size();
		$(document).keydown(function(e){
			switch (e.which) {
				case 37:
					$(window).attr('location', $('.jump a').eq(0).attr('href'));
					break;
				case 39:
					$(window).attr('location', $('.jump a').eq(2).attr('href'));
					break;
				case 13:
					$(window).attr('location', $('.jump a').eq(1).attr('href'));
					break;
			}
		});
	}
	if (articleid > 0) {
		var visit = window.localStorage.getItem('visit_'+articleid) || 0;
		if (Math.floor(visit/8640000) !== Math.floor($.now()/8640000)) {
			$.getJSON('/book/visit/'+articleid+'/?d=json');
			window.localStorage.setItem('visit_'+articleid, $.now());
		}
		if ($('#expand').length > 0) {
			if ($('#bookintro')[0].scrollHeight > 100) {
				$('#bookintro').height(80);
				$('#expand').show().click(function(){
					if ($(this).text() == '[+展开]') {
						$(this).text('[-收起]');
						$('#bookintro').height('auto');
					} else {
						$(this).text('[+展开]');
						$('#bookintro').height(80);
					}
				});
			}
		}
	}
}