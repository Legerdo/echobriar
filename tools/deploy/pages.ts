/**
 * GitHub Pages 배포: 빌드 산출물(dist)을 gh-pages 브랜치로 올린다.
 * 사용: npm run deploy   (먼저 origin 원격 저장소가 설정되어 있어야 함)
 *
 * gh-pages 브랜치는 배포 전용이다. 매번 dist 한 커밋으로 덮어쓴다(강제 푸시).
 */
import { execFileSync, execSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, stdio: 'inherit' });
const gitOut = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const remote = gitOut(['remote', 'get-url', 'origin'], ROOT);
const rev = gitOut(['rev-parse', '--short', 'HEAD'], ROOT);

if (!process.argv.includes('--no-build')) execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
const dist = join(ROOT, 'dist');
if (!existsSync(join(dist, 'index.html')) || !existsSync(join(dist, 'generated', 'manifest.json'))) throw new Error('dist 빌드 산출물이 없습니다');

const tmp = mkdtempSync(join(tmpdir(), 'echobriar-pages-'));
try {
  cpSync(dist, tmp, { recursive: true });
  // Jekyll 처리 끄기 (밑줄로 시작하는 파일 보존)
  writeFileSync(join(tmp, '.nojekyll'), '');
  git(['init', '-q', '-b', 'gh-pages'], tmp);
  git(['add', '-A'], tmp);
  git(['commit', '-q', '-m', `배포: ${rev}`], tmp);
  git(['push', '-f', remote, 'gh-pages'], tmp);
  console.log(`[deploy] gh-pages 브랜치로 배포 완료 (${rev})`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
