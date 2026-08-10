## webview-fix-kit이란

모바일 Webview 환경에서 일어나는 문제점을 해결하기 위해 만든 React 라이브러리이다.

웹뷰로 만든 앱에 관심이 많아 웹뷰로 만든 앱 *(토스, 당근 등...)* 을 써보면서 여러 문제들을 발견했고 이런 문제를 해결하기 위해 이 라이브러리를 만들었다.

오픈 소스 라이브러리는 https://github.com/je0ngmin/hangul_utils, https://github.com/je0ngmin/screenstack 이후로 세 번째로 만드는 건데, hangul_utils는 Dart 라이브러리라 배포가 쉬웠지만 screenstack과 webview-fix-kit은 Typescript 기반이라 tsdown 같은 번들러를 설정해야 해서 좀 어려웠다... 그래도 만들면서 여러모로 배운 게 많은 것 같아서 재밌었다.

## 설치

```bash
npm i webview-fix-kit
```

## features
### useWebviewHover

터치 스크린 환경에서는 CSS의 `:hover`가 작동하지 않거나 이상하게 동작하는 문제점이 있다. `useWebviewHover`를 이용해 `ref`을 만들고 버튼에 `ref`을 넘기면 해당 버튼에 hover 중인 상태일 시 `data-webview-hover` 속성이 붙는다.

```tsx
import { useWebviewHover } from 'webview-fix-kit';

function HoverButton() {
  const hoverRef = useWebviewHover<HTMLButtonElement>();

  return (
    <button ref={hoverRef} type="button">
      Touch me
    </button>
  );
}
```

해당 속성을 이용해 CSS에서 data attribute selector로 hover 스타일을 지정할 수 있다.

```css
button[data-webview-hover] {
	transform: scale(0.95);
}
```

### WebviewImageLongClickGuard

모바일 웹 브라우저 또는 웹뷰 환경에서 이미지를 길게 누를 시 context menu가 나오는 문제를 해결하기 위한 컴포넌트. img 태그에 감싸주면 해당 부분에 길게 누르는 동작이 작동하지 않도록 할 수 있다. 

```tsx
import { WebviewImageLongClickGuard } from 'webview-fix-kit';

function ProtectedImage() {
  return (
    <WebviewImageLongClickGuard>
      <img src="/photo.jpg" alt="Sample" />
    </WebviewImageLongClickGuard>
  );
}
```

### WebviewInput, WebviewTextarea

iOS 웹 브라우저 또는 웹뷰 환경에서 Input에 focus했을 시 페이지 전체의 스크롤이 밀리는 문제를 해결하기 위한 컴포넌트. `WebviewInput`, `WebviewTextarea` 모두 `input`, `textarea`과 똑같이 사용할 수 있어 컴포넌트만 교체할 수 있다.

- [웹뷰 엔지니어를 위한 iOS WebView input 경험 개선기](https://medium.com/daangn/%EC%9B%B9%EB%B7%B0-%EC%97%94%EC%A7%80%EB%8B%88%EC%96%B4%EB%A5%BC-%EC%9C%84%ED%95%9C-ios-webview-input-%EA%B2%BD%ED%97%98-%EA%B0%9C%EC%84%A0%EA%B8%B0-94a5c2882118)
- [https://gist.github.com/kiding/72721a0553fa93198ae2bb6eefaa3299](https://gist.github.com/kiding/72721a0553fa93198ae2bb6eefaa3299)


```tsx
import { useState } from 'react';
import { WebviewInput, WebviewTextarea } from 'webview-fix-kit';

function NicknameInput() {
  const [nickname, setNickname] = useState('');
  const [message, setMessage] = useState('');

  return (
    <form style={{
	    display: "flex",
	    flexDirection: "column",
	    gap: 8
    }}>
	    <WebviewInput
	      name="nickname"
	      required
	      value={nickname}
	      placeholder="Enter your nickname"
	      onChange={(event) => setNickname(event.target.value)}
	    />
	    <WebviewTextarea
	      name="message"
	      rows={5}
	      value={message}
	      placeholder="Enter your message"
	      onChange={(event) => setMessage(event.target.value)}
	    />
    </form>
  );
}
```

## 기여하기

https://github.com/je0ngmin/webview-fix-kit