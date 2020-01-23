import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response as ExpressResponse } from 'express';
import * as formatLinkHeader from 'format-link-header';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Response extends from Express
 */
export interface Response<T> extends ExpressResponse {
  data: Data<T>
}

/**
 * Data interface
 */
interface Data<T> {
  resource: T[];
  totalDocs: number;
}

type Relation = 'first' | 'next' | 'prev' | 'last';
/**
 * Argument required to build the Link header
 */
interface LinkOptions {
  page: string;
  limit: string;
  resourceUrl: string;
  totalDocs: number;
}
/**
 * Interceptor adding a Link Header
 * RFC 5988 (https://tools.ietf.org/html/rfc5988)
 */
@Injectable()
export class LinkHeaderInterceptor<T> implements NestInterceptor<T, void> {
  /**
   * Interceptor core method
   * @param context Current request pipeline details
   * @param next Response stream
   */
  public intercept(context: ExecutionContext, next: CallHandler): Observable<void> {
    const request: Request = context.switchToHttp().getRequest();

    const resourceUrl: string = request.url.split('?')[0];
    const page: string = request.query.page ?? '1';
    const limit: string = request.query.per_page ?? '100';

    return next.handle().pipe(
      map((data: Data<T>) => {
        const response: Response<T> = context.switchToHttp().getResponse();
        const linkHeader: string = this.setLinkHeader({
          page,
          limit,
          resourceUrl,
          totalDocs: data.totalDocs,
        });

        response.setHeader('Link', linkHeader);
      }),
    );
  }

  /**
   * Set a link header
   * @param linkOptions Required argument to build the header
   */
  private readonly setLinkHeader = (linkOptions: LinkOptions): string => {
    const page: number = Number(linkOptions.page);
    const hasNextPage: boolean = page <= Math.floor(linkOptions.totalDocs / Number(linkOptions.limit));
    const isFirstPage: boolean = page === 1;

    const linkObject: formatLinkHeader.Links = {
      first: this.buildLink('first', linkOptions),
      last: this.buildLink('last', linkOptions),
    };

    if (hasNextPage) {
      linkObject.next = this.buildLink('next', linkOptions);
    }

    if (!isFirstPage) {
      linkObject.prev = this.buildLink('prev', linkOptions);
    }

    return formatLinkHeader(linkObject);
  };

  /**
   * Build a link object
   * @param rel Relation
   * @param linkOptions Link optioins
   */
  private readonly buildLink = (rel: Relation, linkOptions: LinkOptions): formatLinkHeader.Link => {
    const page: number = Number(linkOptions.page);
    const link: formatLinkHeader.Link = {
      url: linkOptions.resourceUrl,
      rel,
      per_page: linkOptions.limit,
      page: linkOptions.page,
    };

    switch (rel) {
      case 'first':
        link.url += '?page=1';
        break;

      case 'prev':
        link.page = (page - 1).toString();
        link.url += `?page=${page - 1}`;
        break;

      case 'last':
        link.url += `?page=${Math.floor(linkOptions.totalDocs / Number(linkOptions.limit)) + 1}`;
        break;

      // Next relation
      default:
        link.page = (page + 1).toString();
        link.url += `?page=${page + 1}`;
        break;
    }

    link.url += `&per_page=${linkOptions.limit}`;

    return link;
  };
}
