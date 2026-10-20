import { lazy, Suspense, type ComponentType } from "react";
export default function dynamic<Props extends object>(loader: () => Promise<{ default: ComponentType<Props> }>, options: { loading: ComponentType }) {
  const Child = lazy(loader), Loading = options.loading;
  return function PreviewBoundary(props: Props) { return <Suspense fallback={<Loading />}><Child {...props} /></Suspense>; };
}
