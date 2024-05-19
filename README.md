# Kubernetes sidecar log upload

## linting

```
npm run lint --if-present
```

## testing

```
npm test --if-present
```

## example deployment
```
apiVersion: v1
kind: Pod
metadata:
  name: log-shared-pod
spec:
  containers:
  - name: app-container
    image: nginx
    volumeMounts:
    - name: shared-log
      mountPath: /var/log
  - name: sidecar-container
    image: ghcr.io/jobscale/log-upload
    env:
    - name: FILE_PATH
      value: "/var/log/sidecar/access.log"
    - name: LOG_ENDPOINT
      value: "https://log.example.jp/upload"
    volumeMounts:
    - name: shared-log
      mountPath: /var/log/sidecar
  volumes:
  - name: shared-log
    emptyDir: {}
```
