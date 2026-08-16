# Je0ngmin의 블로그

JavaScript 런타임 없이 HTML과 CSS만 배포하는 정적 블로그입니다. TypeScript 빌드 스크립트가 Nunjucks 템플릿과 Markdown 글을 HTML로 변환합니다.

## 개발

```bash
npm install
npm run dev
```

`template/`의 HTML/CSS와 `articles/`의 Markdown/YAML을 수정하면 페이지가 자동으로 다시 생성되고 브라우저가 새로고침됩니다.

## 프로덕션 빌드

```bash
npm run build
```

압축된 HTML, CSS와 정적 파일이 `build/`에 생성됩니다. 빌드 결과를 로컬에서 확인하려면 `npm run preview`를 실행합니다.

## 글 추가

`articles/<글 번호>/`에 다음 두 파일을 추가합니다.

- `metadata.yaml`: 제목, 발행일, 설명, 키워드
- `content.md`: 본문
