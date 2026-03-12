#import "WebViewController.h"
#import <WebKit/WebKit.h>

@interface WebViewController () <WKNavigationDelegate>

@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) UIProgressView *progressView;
@property (nonatomic, strong) UILabel *statusLabel;
@property (nonatomic, assign) BOOL attemptedRemoteFallback;

@end

@implementation WebViewController

- (NSString *)avatarFallbackScript {
  return @"(function(){"
          "if(window.__amasAvatarPatchInstalled){return;}"
          "window.__amasAvatarPatchInstalled=true;"
          "function decodeName(value){"
            "if(!value){return '';}"
            "try{return decodeURIComponent(String(value).replace(/\\+/g,' '));}"
            "catch(_error){return String(value);}"
          "}"
          "function escapeXml(value){"
            "return String(value)"
              ".replace(/&/g,'&amp;')"
              ".replace(/</g,'&lt;')"
              ".replace(/>/g,'&gt;')"
              ".replace(/\\\"/g,'&quot;')"
              ".replace(/'/g,'&#39;');"
          "}"
          "function initials(label){"
            "var normalized=String(label||'AMAS').trim();"
            "if(!normalized){normalized='AMAS';}"
            "var words=normalized.split(/[\\s._-]+/).filter(Boolean);"
            "if(words.length>=2){return (words[0].slice(0,1)+words[1].slice(0,1)).toUpperCase();}"
            "normalized=normalized.replace(/\\s+/g,'');"
            "return normalized.slice(0,2).toUpperCase();"
          "}"
          "function paletteForLabel(label){"
            "var palettes=["
              "['#1e3a8a','#2563eb','#dbeafe'],"
              "['#0f766e','#14b8a6','#ccfbf1'],"
              "['#7c2d12','#ea580c','#ffedd5'],"
              "['#4c1d95','#8b5cf6','#ede9fe'],"
              "['#9f1239','#f43f5e','#ffe4e6'],"
              "['#14532d','#22c55e','#dcfce7']"
            "];"
            "var text=String(label||'AMAS');"
            "var hash=0;"
            "for(var i=0;i<text.length;i+=1){"
              "hash=(hash*31+text.charCodeAt(i))>>>0;"
            "}"
            "return palettes[hash%palettes.length];"
          "}"
          "function avatarDataUri(label){"
            "var palette=paletteForLabel(label);"
            "var text=escapeXml(initials(label));"
            "var svg=''"
              "+'<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 96 96\">'"
              "+'<defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">'"
              "+'<stop offset=\"0%\" stop-color=\"'+palette[0]+'\"/>'"
              "+'<stop offset=\"100%\" stop-color=\"'+palette[1]+'\"/>'"
              "+'</linearGradient>'"
              "+'<radialGradient id=\"glow\" cx=\"28%\" cy=\"20%\" r=\"70%\">'"
              "+'<stop offset=\"0%\" stop-color=\"#ffffff\" stop-opacity=\"0.45\"/>'"
              "+'<stop offset=\"100%\" stop-color=\"#ffffff\" stop-opacity=\"0\"/>'"
              "+'</radialGradient>'"
              "+'</defs>'"
              "+'<rect width=\"96\" height=\"96\" rx=\"26\" fill=\"url(#g)\"/>'"
              "+'<rect width=\"96\" height=\"96\" rx=\"26\" fill=\"url(#glow)\"/>'"
              "+'<circle cx=\"48\" cy=\"34\" r=\"14\" fill=\"rgba(255,255,255,0.92)\"/>'"
              "+'<path d=\"M22 78c4-14 15-22 26-22s22 8 26 22\" fill=\"rgba(255,255,255,0.88)\"/>'"
              "+'<rect x=\"18\" y=\"68\" width=\"60\" height=\"18\" rx=\"9\" fill=\"rgba(15,23,42,0.24)\"/>'"
              "+'<text x=\"48\" y=\"81\" text-anchor=\"middle\" font-family=\"-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif\" font-size=\"16\" font-weight=\"700\" fill=\"'+palette[2]+'\">'+text+'</text>'"
              "+'<rect x=\"1.5\" y=\"1.5\" width=\"93\" height=\"93\" rx=\"24.5\" fill=\"none\" stroke=\"rgba(255,255,255,0.28)\" stroke-width=\"3\"/>'"
              "+'</svg>';"
            "return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);"
          "}"
          "function labelForImage(img){"
            "var candidates=[img.getAttribute('data-name'),img.getAttribute('alt'),img.getAttribute('title')];"
            "var src=img.getAttribute('src')||img.currentSrc||'';"
            "if(src.indexOf('ui-avatars.com')!==-1){"
              "try{"
                "var url=new URL(src,document.baseURI);"
                "var name=url.searchParams.get('name');"
                "if(name){candidates.unshift(name);}"
              "}catch(_error){}"
            "}"
            "for(var i=0;i<candidates.length;i+=1){"
              "var candidate=decodeName(candidates[i]).trim();"
              "if(candidate){return candidate;}"
            "}"
            "var container=img.closest('button,div,li,a')||img.parentElement;"
            "var text=container&&container.innerText?container.innerText.replace(/\\s+/g,' ').trim():'';"
            "return text||'AMAS';"
          "}"
          "function replaceImage(img,force){"
            "if(!img){return;}"
            "var src=img.getAttribute('src')||img.currentSrc||'';"
            "var shouldReplace=force||src.indexOf('ui-avatars.com')!==-1;"
            "if(!shouldReplace){return;}"
            "var fallback=avatarDataUri(labelForImage(img));"
            "img.dataset.amasAvatarPatched='1';"
            "img.removeAttribute('srcset');"
            "img.style.objectFit='cover';"
            "img.style.borderRadius='18px';"
            "img.style.background='transparent';"
            "img.setAttribute('src',fallback);"
            "img.src=fallback;"
          "}"
          "function scan(root){"
            "var scope=root&&root.querySelectorAll?root:document;"
            "var images=scope.querySelectorAll('img');"
            "for(var i=0;i<images.length;i+=1){"
              "var img=images[i];"
              "var src=img.getAttribute('src')||img.currentSrc||'';"
              "if(src.indexOf('ui-avatars.com')!==-1){replaceImage(img,true);}"
              "else if(img.complete&&typeof img.naturalWidth==='number'&&img.naturalWidth===0){replaceImage(img,true);}"
            "}"
          "}"
          "document.addEventListener('error',function(event){"
            "var target=event.target;"
            "if(target&&target.tagName==='IMG'){replaceImage(target,true);}"
          "},true);"
          "var observer=new MutationObserver(function(records){"
            "for(var i=0;i<records.length;i+=1){"
              "var record=records[i];"
              "if(record.type==='attributes'&&record.target&&record.target.tagName==='IMG'){"
                "replaceImage(record.target,false);"
                "continue;"
              "}"
              "for(var j=0;j<record.addedNodes.length;j+=1){"
                "var node=record.addedNodes[j];"
                "if(!node||node.nodeType!==1){continue;}"
                "if(node.tagName==='IMG'){replaceImage(node,false);}"
                "scan(node);"
              "}"
            "}"
          "});"
          "function boot(){"
            "scan(document);"
            "observer.observe(document.documentElement||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});"
            "window.setTimeout(function(){scan(document);},600);"
            "window.setTimeout(function(){scan(document);},1800);"
          "}"
          "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',boot,{once:true});}"
          "else{boot();}"
        "})();";
}

- (void)dealloc {
  [self.webView removeObserver:self forKeyPath:@"estimatedProgress"];
  [self.webView removeObserver:self forKeyPath:@"title"];
}

- (void)viewDidLoad {
  [super viewDidLoad];

  self.view.backgroundColor = [UIColor systemBackgroundColor];

  WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
  WKUserContentController *contentController = [[WKUserContentController alloc] init];
  WKUserScript *avatarPatchScript =
      [[WKUserScript alloc] initWithSource:[self avatarFallbackScript]
                             injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                          forMainFrameOnly:NO];
  [contentController addUserScript:avatarPatchScript];
  configuration.userContentController = contentController;
  self.webView = [[WKWebView alloc] initWithFrame:CGRectZero configuration:configuration];
  self.webView.translatesAutoresizingMaskIntoConstraints = NO;
  self.webView.navigationDelegate = self;
  self.webView.allowsBackForwardNavigationGestures = YES;
  self.webView.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;

  self.progressView = [[UIProgressView alloc] initWithProgressViewStyle:UIProgressViewStyleDefault];
  self.progressView.translatesAutoresizingMaskIntoConstraints = NO;
  self.progressView.hidden = YES;

  self.statusLabel = [[UILabel alloc] initWithFrame:CGRectZero];
  self.statusLabel.translatesAutoresizingMaskIntoConstraints = NO;
  self.statusLabel.hidden = YES;
  self.statusLabel.text = @"Loading recovered snapshot...";
  self.statusLabel.textAlignment = NSTextAlignmentCenter;
  self.statusLabel.numberOfLines = 0;
  self.statusLabel.textColor = [UIColor secondaryLabelColor];
  self.statusLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleFootnote];
  self.statusLabel.backgroundColor = [[UIColor systemBackgroundColor] colorWithAlphaComponent:0.92];
  self.statusLabel.layer.cornerRadius = 16.0;
  self.statusLabel.layer.masksToBounds = YES;

  [self.view addSubview:self.webView];
  [self.view addSubview:self.progressView];
  [self.view addSubview:self.statusLabel];

  UILayoutGuide *safeArea = self.view.safeAreaLayoutGuide;
  [NSLayoutConstraint activateConstraints:@[
    [self.progressView.topAnchor constraintEqualToAnchor:self.view.topAnchor],
    [self.progressView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
    [self.progressView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    [self.webView.topAnchor constraintEqualToAnchor:self.progressView.bottomAnchor],
    [self.webView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
    [self.webView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    [self.webView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
    [self.statusLabel.leadingAnchor constraintEqualToAnchor:safeArea.leadingAnchor constant:16.0],
    [self.statusLabel.trailingAnchor constraintEqualToAnchor:safeArea.trailingAnchor constant:-16.0],
    [self.statusLabel.centerYAnchor constraintEqualToAnchor:safeArea.centerYAnchor]
  ]];

  [self.webView addObserver:self forKeyPath:@"estimatedProgress" options:NSKeyValueObservingOptionNew context:nil];
  [self.webView addObserver:self forKeyPath:@"title" options:NSKeyValueObservingOptionNew context:nil];

  [self loadSite];
}

- (void)loadSite {
  self.attemptedRemoteFallback = NO;
  [self loadLocalRecoveredSite];
}

- (void)loadLocalRecoveredSite {
  NSURL *url = [NSURL URLWithString:@"http://127.0.0.1:4173/"];
  NSURLRequest *request = [NSURLRequest requestWithURL:url
                                           cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                       timeoutInterval:20.0];
  [self.webView loadRequest:request];
}

- (void)loadRemoteRecoveredSite {
  NSURL *url = [NSURL URLWithString:@"https://enoslee2025-eng.github.io/AMAS-Seminary/recovered/"];
  NSURLRequest *request = [NSURLRequest requestWithURL:url
                                           cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                       timeoutInterval:20.0];
  [self.webView loadRequest:request];
}

- (void)reloadSite {
  self.statusLabel.hidden = YES;
  [self.webView reload];
}

- (void)openInSafari {
  NSURL *url = [NSURL URLWithString:@"https://enoslee2025-eng.github.io/AMAS-Seminary/recovered/"];
  if (!url) {
    return;
  }

  [UIApplication.sharedApplication openURL:url options:@{} completionHandler:nil];
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context {
  if ([keyPath isEqualToString:@"estimatedProgress"]) {
    double progress = self.webView.estimatedProgress;
    self.progressView.hidden = progress >= 1.0;
    [self.progressView setProgress:(float)progress animated:YES];
  } else if ([keyPath isEqualToString:@"title"]) {
  } else {
    [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
  }
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
  self.progressView.hidden = YES;
  self.statusLabel.hidden = YES;
}

- (void)webView:(WKWebView *)webView
didFailNavigation:(WKNavigation *)navigation
      withError:(NSError *)error {
  if (!self.attemptedRemoteFallback) {
    self.attemptedRemoteFallback = YES;
    [self loadRemoteRecoveredSite];
    return;
  }

  self.statusLabel.text = [NSString stringWithFormat:@"Load failed: %@", error.localizedDescription];
  self.progressView.hidden = YES;
  self.statusLabel.hidden = NO;
}

- (void)webView:(WKWebView *)webView
didFailProvisionalNavigation:(WKNavigation *)navigation
      withError:(NSError *)error {
  if (!self.attemptedRemoteFallback) {
    self.attemptedRemoteFallback = YES;
    [self loadRemoteRecoveredSite];
    return;
  }

  self.statusLabel.text = [NSString stringWithFormat:@"Unable to reach site: %@", error.localizedDescription];
  self.progressView.hidden = YES;
  self.statusLabel.hidden = NO;
}

@end
