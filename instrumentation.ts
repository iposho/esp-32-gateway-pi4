export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startBirdClassifier } = await import('./lib/bird-classifier')
  startBirdClassifier()
  const { startBirdPhotoCleanup } = await import('./lib/bird-photos')
  startBirdPhotoCleanup()
}
