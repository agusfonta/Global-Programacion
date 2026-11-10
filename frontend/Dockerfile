FROM nginx:1.30-alpine
ENV NGINX_ENVSUBST_FILTER=^API_UPSTREAM$
COPY public/ /usr/share/nginx/html/
COPY default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
